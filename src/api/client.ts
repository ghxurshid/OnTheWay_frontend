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

export class ApiError extends Error {
  status: number;
  errors: unknown[];
  constructor(status: number, message: string, errors: unknown[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

export interface HttpOptions extends RequestInit {
  /** Attach the Bearer token (default true). */
  auth?: boolean;
  /** Internal guard so a refresh only retries once. */
  _retried?: boolean;
}

/** Real HTTP call. Returns the unwrapped `data` payload. The backend DTOs are
    not statically modelled, so the default payload type is `any` at this
    boundary; callers may pass an explicit type via `http<Dto>(…)`. */
export async function http<T = any>(path: string, options: HttpOptions = {}): Promise<T> {
  const { auth = true, _retried = false, headers, ...rest } = options;
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;

  const finalHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...(headers as Record<string, string> || {}) };
  if (auth) {
    const token = authStore.getAccessToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { headers: finalHeaders, ...rest });

  // Token expired → refresh once and replay the original request.
  if (res.status === 401 && auth && !_retried && authStore.getRefreshToken()) {
    try {
      await authStore.refresh();
      return http<T>(path, { ...options, _retried: true });
    } catch {
      authStore.clear();
      throw new ApiError(401, 'Session expired. Please sign in again.');
    }
  }

  return parse<T>(res, options.method || 'GET', url);
}

/** Parse the envelope, returning `data` or throwing a rich ApiError. */
async function parse<T>(res: Response, method: string, url: string): Promise<T> {
  if (res.status === 204) return null as T;

  let body: { success?: boolean; data?: unknown; message?: string; errors?: unknown[] } | null = null;
  const text = await res.text();
  if (text) {
    try { body = JSON.parse(text); } catch { /* non-JSON error body */ }
  }

  if (!res.ok || (body && body.success === false)) {
    const message = body?.message || `${method} ${url} → ${res.status}`;
    throw new ApiError(res.status, message, body?.errors || []);
  }

  // Standard envelope → unwrap; tolerate a bare payload just in case.
  return (body && typeof body === 'object' && 'data' in body ? body.data : body) as T;
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
