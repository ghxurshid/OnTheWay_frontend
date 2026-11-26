/* ════════════════════════════════════════════════════════════════
   The in-call "ride together" offer's lifetime, as the CallHub keeps it.
   The server holds an open offer for RIDE_OFFER_LIFETIME_MS; past that (or
   after a restart lost it) an answer is refused with `offer_expired`, and an
   accept reaches the offerer as `RideOfferExpired` (then, for older apps, as
   "not accepted"). So neither side waits longer: the one who received the
   offer stops showing it then, the one who made it a little later (an answer
   given at the last moment still has to arrive).
   ════════════════════════════════════════════════════════════════ */

import { isRateLimited } from './retry';

/** How long the server keeps a ride offer open — AgreementLimits.RideOfferLifetime on the
    backend: change both together. */
export const RIDE_OFFER_LIFETIME_MS = 10 * 60_000;

/** How long the offerer waits for an answer: the lifetime, plus time for an answer given
    at its very end to arrive. */
export const RIDE_OFFER_WAIT_MS = RIDE_OFFER_LIFETIME_MS + 30_000;

/** Hub error code: the offer being answered is not open any more (expired, lost in a
    server restart, answered already) and no agreement of the pair answers it. */
export const OFFER_EXPIRED = 'offer_expired';

const messageOf = (e: unknown): string => (e as Error | null)?.message || '';

/** True when the CallHub refused an answer because the offer is gone (`HubException: offer_expired`). */
export const isOfferExpired = (e: unknown): boolean =>
  new RegExp(`\\b${OFFER_EXPIRED}\\b`).test(messageOf(e));

/** True when an answer did not get through: there was no connection (REALTIME_OFFLINE), the
    server asked to slow down before handling it (`rate_limited`), or the connection went down
    before the server replied — the answer may then not have arrived at all. As far as this side
    knows the offer still stands and can be answered again (had the accept arrived, the agreement
    comes over presence anyway). A reply of the server's own — a refusal, a fault — means the
    answer was handled. */
export const isAnswerUnsent = (e: unknown): boolean =>
  isRateLimited(e) || !/\bon the server\b|HubException|Failed to invoke/.test(messageOf(e));

/** Of the answers that did not get through (isAnswerUnsent): true for one that may have reached
    the server all the same — the connection went down before the reply came, not before the
    answer went out (no connection) or was handled (asked to slow down). An accept like that may
    have made the agreement. */
export const isAnswerLost = (e: unknown): boolean =>
  isAnswerUnsent(e) && !isRateLimited(e) && (e as { code?: unknown } | null)?.code !== 'REALTIME_OFFLINE';
