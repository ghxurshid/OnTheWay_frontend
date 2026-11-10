/* ════════════════════════════════════════════════════════════════
   SERVICE — trip commands that must reach the server even when the network
   is down at the moment the user acts: closing the Live trip behind a route
   (complete / cancel) and "band" (hide / show). A lost close would leave a
   ghost trip others still discover, a lost hide a "full" walker still
   listed. Commands are persisted, collapsed per trip (a close supersedes
   everything, the latest visibility wins) and retried in order whenever the
   connection is back — and on the next launch.
   ════════════════════════════════════════════════════════════════ */

import { ApiError } from '@/api/client';
import { tripApi } from '@/api/tripApi';
import { readJson, writeJson } from '@/utils/storage';

const KEY = 'ontheway_trip_outbox_v1';
/** A command the server keeps failing (5xx) is dropped after this many tries. */
const MAX_ATTEMPTS = 5;

export type TripCommand =
  | { kind: 'complete'; tripId: string; companionIds: string[] }
  | { kind: 'cancel'; tripId: string }
  | { kind: 'hide' | 'show'; tripId: string };

type Queued = TripCommand & { attempts?: number };

const isClose = (c: TripCommand) => c.kind === 'complete' || c.kind === 'cancel';

let queue: Queued[] = readJson<Queued[]>(KEY, []);
const save = () => writeJson(KEY, queue.length ? queue : null);

function run(c: TripCommand): Promise<unknown> {
  switch (c.kind) {
    case 'complete': return tripApi.complete(c.tripId, c.companionIds);
    case 'cancel': return tripApi.cancel(c.tripId);
    case 'hide': return tripApi.hide(c.tripId);
    default: return tripApi.show(c.tripId);
  }
}

/** Worth sending again later: it never reached the server, the session must be
    renewed first, or the server failed (a few times at most). A refusal (4xx —
    e.g. the trip is closed already) is final. */
const keepForRetry = (e: unknown, attempts: number): boolean =>
  e instanceof ApiError
  && (e.status === 0 || e.code === 'session' || (e.status >= 500 && attempts < MAX_ATTEMPTS));

let flushing: Promise<void> | null = null;
let again = false; // something was queued while a flush was finishing

export const tripOutbox = {
  /** Queue a command (collapsing what it supersedes) and send the queue. */
  enqueue(command: TripCommand): Promise<void> {
    const sameTrip = (q: Queued) => q.tripId === command.tripId;
    if (!isClose(command) && queue.some((q) => sameTrip(q) && isClose(q))) return tripOutbox.flush(); // closed anyway
    queue = [...queue.filter((q) => !sameTrip(q)), command];
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
          const attempts = (head.attempts || 0) + 1;
          if (keepForRetry(e, attempts)) {
            queue = queue.map((q) => (q === head ? { ...head, attempts } : q));
            save();
            return; // offline / server down: retry on the next flush
          }
          // Refused (e.g. already closed): nothing more to do for it.
        }
        // By identity: a newer command for the trip may have replaced it meanwhile.
        queue = queue.filter((q) => q !== head);
        save();
      }
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
