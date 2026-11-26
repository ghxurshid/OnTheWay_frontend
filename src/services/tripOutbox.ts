/* ════════════════════════════════════════════════════════════════
   SERVICE — trip commands that must reach the server even when the network
   is down at the moment the user acts: closing the Live trip behind a route
   (complete / cancel), "band" (hide / show) and rating the companion of a
   finished trip. A lost close would leave a ghost trip others still
   discover, a lost hide a "full" walker still listed, a lost rating an
   unrated companion. Commands are persisted, collapsed per trip (a close
   supersedes the visibility commands, the latest visibility wins) and
   retried in order whenever the connection is back — the device reports
   "online", the realtime connection (re)connects (a network cut by a proxy
   or a captive portal never fires "online"), or a backoff timer runs out
   while something is still waiting — and on the next launch. A rating
   always runs after its trip's close (it needs a completed trip) and is
   kept per (trip, person).
   ════════════════════════════════════════════════════════════════ */

import { ApiError } from '@/api/client';
import { tripApi } from '@/api/tripApi';
import { ratingsApi } from '@/api/ratingsApi';
import { presenceClient } from '@/services/realtime';
import { createBackoff } from '@/services/realtime/retry';
import { readJson, writeJson } from '@/utils/storage';

const KEY = 'ontheway_trip_outbox_v1';
/** A command the server keeps failing (5xx) is dropped after this many tries. */
const MAX_ATTEMPTS = 5;

export type TripCommand =
  | { kind: 'complete'; tripId: string; companionIds: string[] }
  | { kind: 'cancel'; tripId: string }
  | { kind: 'hide' | 'show'; tripId: string }
  | { kind: 'rate'; tripId: string; rateeId: string; stars: number; tags: string[] };

type Queued = TripCommand & { attempts?: number };

const isClose = (c: TripCommand) => c.kind === 'complete' || c.kind === 'cancel';
const isRate = (c: TripCommand): c is Extract<TripCommand, { kind: 'rate' }> => c.kind === 'rate';

let queue: Queued[] = readJson<Queued[]>(KEY, []);
const save = () => writeJson(KEY, queue.length ? queue : null);

function run(c: TripCommand): Promise<unknown> {
  switch (c.kind) {
    case 'complete': return tripApi.complete(c.tripId, c.companionIds);
    case 'cancel': return tripApi.cancel(c.tripId);
    case 'hide': return tripApi.hide(c.tripId);
    case 'rate': return ratingsApi.submit({ tripId: c.tripId, rateeId: c.rateeId, stars: c.stars, tags: c.tags });
    default: return tripApi.show(c.tripId);
  }
}

/** Worth sending again later: it never reached the server, the session must be
    renewed first, the server asked us to slow down (429 — the same request goes
    through once its budget refills), or the server failed (a few times at most).
    A refusal (other 4xx — e.g. the trip is closed already, a rating already given
    (409) or not allowed (403/404)) is final. */
const keepForRetry = (e: unknown, attempts: number): boolean =>
  e instanceof ApiError
  && (e.status === 0 || e.code === 'session' || e.status === 429 || (e.status >= 500 && attempts < MAX_ATTEMPTS));

/** Where `command` goes: replacing what it supersedes, and always ahead of the
    trip's ratings (a rating needs the trip closed first). */
function place(command: TripCommand): Queued[] {
  if (isRate(command)) {
    const same = (q: Queued) => isRate(q) && q.tripId === command.tripId && q.rateeId === command.rateeId;
    return [...queue.filter((q) => !same(q)), command];
  }
  const kept = queue.filter((q) => q.tripId !== command.tripId || isRate(q));
  const firstRate = kept.findIndex((q) => isRate(q) && q.tripId === command.tripId);
  return firstRate < 0 ? [...kept, command] : [...kept.slice(0, firstRate), command, ...kept.slice(firstRate)];
}

let flushing: Promise<void> | null = null;
let again = false; // something was queued while a flush was finishing
const retry = createBackoff(() => { tripOutbox.flush(); });

export const tripOutbox = {
  /** Queue a command (collapsing what it supersedes) and send the queue. */
  enqueue(command: TripCommand): Promise<void> {
    const closing = (q: Queued) => q.tripId === command.tripId && isClose(q);
    if ((command.kind === 'hide' || command.kind === 'show') && queue.some(closing)) return tripOutbox.flush(); // closed anyway
    queue = place(command);
    save();
    return tripOutbox.flush();
  },

  /** Send what is queued, oldest first; stop at the first network failure. */
  flush(): Promise<void> {
    if (flushing) { again = true; return flushing; }
    flushing = (async () => {
      while (queue.length) {
        const head = queue[0];
        try {
          await run(head);
        } catch (e) {
          // Only server faults use up the command's tries: time offline, a session
          // being renewed or being asked to slow down never do.
          const attempts = (head.attempts || 0) + (e instanceof ApiError && e.status >= 500 ? 1 : 0);
          if (keepForRetry(e, attempts)) {
            queue = queue.map((q) => (q === head ? { ...head, attempts } : q));
            save();
            retry.schedule(); // offline / server down: again soon (or on the next connect)
            return;
          }
          // Refused (e.g. already closed / already rated): nothing more to do for it.
        }
        // By identity: a newer command for the trip may have replaced it meanwhile.
        queue = queue.filter((q) => q !== head);
        save();
      }
      retry.reset();
    })().finally(() => {
      flushing = null;
      if (again) { again = false; tripOutbox.flush(); }
    });
    return flushing;
  },

  /** Queued commands (for tests / diagnostics). */
  pending: (): readonly TripCommand[] => queue,
};

if (typeof window !== 'undefined') window.addEventListener('online', () => { tripOutbox.flush(); });
// The realtime connection is (back) up: the network works, whatever "online" said.
// Not awaited — REST must not hold up the hub's resync.
presenceClient.onResync(async () => { tripOutbox.flush(); });
