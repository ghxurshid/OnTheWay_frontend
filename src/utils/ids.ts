/* Id helpers. Backend ids are numeric longs that travel as strings (REST and
   SignalR alike); simulated demo walkers use 'sim_…' ids. Always compare ids as
   strings — a number-vs-string mismatch silently breaks Map lookups. */

const REAL_ID_RE = /^\d+$/;

/** Normalizes any id (number, string, null) to its string form. */
export const idOf = (value: unknown): string => String(value ?? '');

/** True for a real backend user (not a simulated demo walker). */
export const isRealUserId = (value: unknown): boolean => REAL_ID_RE.test(idOf(value));

/** A new device-generated id for an outgoing item (idempotency key). Older
    WebViews lack crypto.randomUUID, so fall back to time + randomness. */
export const newClientId = (): string =>
  (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
