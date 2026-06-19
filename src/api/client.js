/* ════════════════════════════════════════════════════════════════
   API CLIENT — the single seam between the app and the backend.
   ────────────────────────────────────────────────────────────────
   Today every repository in api/* resolves from mocks/ through `mockResponse`.
   To go live against a real backend you only touch THIS FILE and the URL
   strings inside each api/*.js module:

     1. Set USE_MOCKS = false (or VITE_USE_MOCKS=false in .env).
     2. Set BASE_URL to your API origin (VITE_API_BASE_URL).
     3. Each api/*.js already calls `http(path)` in its non-mock branch —
        just confirm the endpoint paths.

   Pages / components / hooks / services never import mocks/ directly, so no
   changes ripple upward.
   ════════════════════════════════════════════════════════════════ */

const env = import.meta.env || {};

export const USE_MOCKS = env.VITE_USE_MOCKS ? env.VITE_USE_MOCKS !== 'false' : true;
export const BASE_URL = env.VITE_API_BASE_URL || '/api';

// Simulated network latency for mock responses (ms) — keeps loading states
// realistic so they don't disappear the moment you switch to a real backend.
const MOCK_LATENCY = 220;

/** Resolve a deep-cloned mock payload after a simulated round-trip. */
export function mockResponse(data, latency = MOCK_LATENCY) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(structuredCloneSafe(data)), latency);
  });
}

/** Real HTTP call (used once USE_MOCKS is false). Returns parsed JSON. */
export async function http(path, options = {}) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) throw new ApiError(res.status, `${options.method || 'GET'} ${url} → ${res.status}`);
  return res.status === 204 ? null : res.json();
}

export class ApiError extends Error {
  constructor(status, message) { super(message); this.name = 'ApiError'; this.status = status; }
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
