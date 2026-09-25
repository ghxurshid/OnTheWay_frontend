/* ════════════════════════════════════════════════════════════════
   API CLIENT — the single seam between the app and the backend.
   ────────────────────────────────────────────────────────────────
   The OnTheWay backend wraps every response in a standard envelope:

       { success, data, message, errors }

   `http()` unwraps it to `data` on success and throws an `ApiError`
   carrying `message`/`errors` otherwise — so callers see plain payloads.

   Auth: a JWT access token (from authStore) is attached as a Bearer
   header. On a 401 the client transparently refreshes the token once and
   retries the request, so screens never deal with token expiry.
   ════════════════════════════════════════════════════════════════ */

import { authStore } from '@/services/authStore';

const env = import.meta.env || {};

// Default to LIVE now that the backend exists; flip with VITE_USE_MOCKS=true.
export const USE_MOCKS = String(env.VITE_USE_MOCKS) === 'true';
export const BASE_URL = (env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

// Simulated network latency for mock responses (ms).
const MOCK_LATENCY = 220;

/** Resolve a deep-cloned mock payload after a simulated round-trip. */
export function mockResponse<T>(data: T, latency = MOCK_LATENCY): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(structuredCloneSafe(data)), latency);
  });
}

/** Failures that never reached the server (no status): lost connectivity, a
    request that took too long, or a session that could not be renewed. */
export type ApiErrorCode = 'network' | 'timeout' | 'session';

export class ApiError extends Error {
  status: number;
  errors: string[];
  code?: ApiErrorCode;
  constructor(status: number, message: string, errors: string[] = [], code?: ApiErrorCode) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
    this.code = code;
  }
}

/** Window event fired when the session is gone and could not be renewed — the
    app shows its "sign in again" screen instead of failing silently. */
export const SESSION_LOST_EVENT = 'ontheway:session-lost';

const DEFAULT_TIMEOUT_MS = 15_000;

export interface HttpOptions extends RequestInit {
  /** Attach the Bearer token (default true). */
  auth?: boolean;
  /** Abort (ApiError code "timeout") after this many ms. Default 15 s. */
  timeoutMs?: number;
  /** Internal guard so a refresh only retries once. */
  _retried?: boolean;
}

/** Real HTTP call. Returns the unwrapped `data` payload. The backend DTOs are
    not statically modelled, so the default payload type is `any` at this
    boundary; callers may pass an explicit type via `http<Dto>(…)`. */
export async function http<T = any>(path: string, options: HttpOptions = {}): Promise<T> {
  const { auth = true, _retried = false, timeoutMs = DEFAULT_TIMEOUT_MS, headers, ...rest } = options;
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;

  const finalHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...(headers as Record<string, string> || {}) };
  if (auth) {
    const token = authStore.getAccessToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  const res = await fetchWithTimeout(url, { headers: finalHeaders, ...rest }, timeoutMs);

  // Session expired → renew it once (refresh token, else a fresh Telegram
  // login — see authService) and replay the original request.
  if (res.status === 401 && auth && !_retried) {
    try {
      await authStore.refresh();
    } catch {
      authStore.clear();
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_LOST_EVENT));
      throw new ApiError(401, 'Session expired.', [], 'session');
    }
    return http<T>(path, { ...options, _retried: true });
  }

  return parse<T>(res);
}

/** fetch() that gives up after `timeoutMs` and turns transport failures into
    ApiErrors with a code, so callers can tell "offline" from "server said no". */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const outer = init.signal;
  outer?.addEventListener('abort', () => controller.abort(), { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (outer?.aborted) throw e;
    throw timedOut
      ? new ApiError(0, 'Request timed out.', [], 'timeout')
      : new ApiError(0, (e as Error)?.message || 'Network request failed.', [], 'network');
  } finally {
    clearTimeout(timer);
  }
}

/** A JSON write request: `send('POST', '/trips', dto)`. The body is optional. */
export function send<T = any>(method: string, path: string, body?: unknown, options: HttpOptions = {}): Promise<T> {
  return http<T>(path, { ...options, method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}

/** Parse the envelope, returning `data` or throwing a rich ApiError. */
async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return null as T;

  let body: { success?: boolean; data?: unknown; message?: string; title?: string; errors?: unknown } | null = null;
  const text = await res.text();
  if (text) {
    try { body = JSON.parse(text); } catch { /* non-JSON error body */ }
  }

  if (!res.ok || (body && body.success === false)) {
    const message = body?.message || body?.title || `HTTP ${res.status}`;
    throw new ApiError(res.status, message, flattenErrors(body?.errors));
  }

  // Standard envelope → unwrap; tolerate a bare payload just in case.
  return (body && typeof body === 'object' && 'data' in body ? body.data : body) as T;
}

/** Envelope errors are a string list; ProblemDetails uses { field: [msgs] }. */
function flattenErrors(errors: unknown): string[] {
  if (Array.isArray(errors)) return errors.map(String);
  if (errors && typeof errors === 'object') {
    return Object.entries(errors as Record<string, unknown>)
      .flatMap(([field, msgs]) => (Array.isArray(msgs) ? msgs : [msgs]).map((m) => `${field}: ${m}`));
  }
  return [];
}

// structuredClone with a fallback that preserves Date instances used in mocks.
function structuredCloneSafe<T>(data: T): T {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(data); } catch { /* fall through */ }
  }
  return cloneWithDates(data);
}
function cloneWithDates<T>(value: T): T {
  if (value instanceof Date) return new Date(value) as unknown as T;
  if (Array.isArray(value)) return value.map(cloneWithDates) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value)) out[k] = cloneWithDates((value as Record<string, unknown>)[k]);
    return out as T;
  }
  return value;
}
