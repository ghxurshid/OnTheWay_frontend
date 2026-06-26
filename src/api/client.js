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

   Configuration (Vite env, see .env):
     VITE_API_BASE_URL  → API origin incl. version, e.g.
                          http://51.38.127.221:5106/api/v1
     VITE_USE_MOCKS     → 'false' to hit the real backend (default: live).
   ════════════════════════════════════════════════════════════════ */

import { authStore } from '@/services/authStore';

const env = import.meta.env || {};

// Default to LIVE now that the backend exists; flip with VITE_USE_MOCKS=true.
export const USE_MOCKS = String(env.VITE_USE_MOCKS) === 'true';
export const BASE_URL = (env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

// Simulated network latency for mock responses (ms).
const MOCK_LATENCY = 220;

/** Resolve a deep-cloned mock payload after a simulated round-trip. */
export function mockResponse(data, latency = MOCK_LATENCY) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(structuredCloneSafe(data)), latency);
  });
}

export class ApiError extends Error {
  constructor(status, message, errors = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

/**
 * Real HTTP call. Returns the unwrapped `data` payload.
 * @param {string}  path     Absolute URL or a path joined onto BASE_URL.
 * @param {object}  options  fetch options. Extra flags:
 *   - auth:  attach the Bearer token (default true)
 *   - _retried: internal guard so a refresh only retries once
 */
export async function http(path, options = {}) {
  const { auth = true, _retried = false, headers, ...rest } = options;
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;

  const finalHeaders = { 'Content-Type': 'application/json', ...(headers || {}) };
  if (auth) {
    const token = authStore.getAccessToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { headers: finalHeaders, ...rest });

  // Token expired → refresh once and replay the original request.
  if (res.status === 401 && auth && !_retried && authStore.getRefreshToken()) {
    try {
      await authStore.refresh();
      return http(path, { ...options, _retried: true });
    } catch {
      authStore.clear();
      throw new ApiError(401, 'Session expired. Please sign in again.');
    }
  }

  return parse(res, options.method || 'GET', url);
}

/** Parse the envelope, returning `data` or throwing a rich ApiError. */
async function parse(res, method, url) {
  if (res.status === 204) return null;

  let body = null;
  const text = await res.text();
  if (text) {
    try { body = JSON.parse(text); } catch { /* non-JSON error body */ }
  }

  if (!res.ok || (body && body.success === false)) {
    const message = body?.message || `${method} ${url} → ${res.status}`;
    throw new ApiError(res.status, message, body?.errors || []);
  }

  // Standard envelope → unwrap; tolerate a bare payload just in case.
  return body && typeof body === 'object' && 'data' in body ? body.data : body;
}

// structuredClone with a fallback that preserves Date instances used in mocks.
function structuredCloneSafe(data) {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(data); } catch (e) { /* fall through */ }
  }
  return cloneWithDates(data);
}
function cloneWithDates(value) {
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(cloneWithDates);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = cloneWithDates(value[k]);
    return out;
  }
  return value;
}
