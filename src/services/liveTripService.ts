/* ════════════════════════════════════════════════════════════════
   SERVICE — the Live trip behind an on-map route.
   The route is persisted as a Live trip so the session survives app
   restarts (and the abandoned-session sweeper can close it if the walker
   vanishes), and closed when the route ends or the walker leaves the map.
   Creating it calls off what it replaces on the server (a journey under way,
   my plans departing around now) — the user is asked first (confirmGoingLive).
   Best-effort throughout: the live map keeps working if a call fails.
   ════════════════════════════════════════════════════════════════ */

import { USE_MOCKS } from '@/api/client';
import { tripApi } from '@/api/tripApi';
import { t } from '@/i18n';
import { presenceClient } from '@/services/realtime';
import { walkerStateStore } from '@/services/walkerStateStore';
import { tripOutbox } from '@/services/tripOutbox';
import { blockStore } from '@/services/blockStore';
import { confirmAction } from '@/services/confirm';
import type { ConfirmRequest } from '@/services/confirm';
import { plansReplacedByLive, tripLine } from '@/services/tripResume';
import type { TripDto } from '@/services/tripResume';
import type { OsrmRoute } from '@/services/routeService';
import type { LatLng, PartyType } from '@/models';
import { fmt12 } from '@/utils/datetime';
import { idOf } from '@/utils/ids';
import { readJson, writeJson } from '@/utils/storage';

// People the walker agreed to ride with during this journey ("ride together"
// accepted by both in a call). Recorded as the trip's companions when it is
// completed — the source of the partner's history, ratings and statistics.
// Each entry carries when it was agreed: a journey is a matter of hours, so one
// older than COMPANION_LIFETIME_MS (an agreement whose end this device never
// heard about) never lands on a later trip.
const COMPANIONS_KEY = 'ontheway_ride_companions_v1';
export const COMPANION_LIFETIME_MS = 24 * 60 * 60 * 1000;

interface CompanionEntry { peerId: string; at: number }

/** The stored list, current entries only. Older builds stored bare ids: those
    count as agreed now (better a companion kept a day than one lost). */
function readCompanions(): CompanionEntry[] {
  const raw = readJson<unknown[]>(COMPANIONS_KEY, []);
  const list = Array.isArray(raw) ? raw : [];
  const now = Date.now();
  const entries = list
    .map((item): CompanionEntry | null => {
      if (typeof item === 'string') return { peerId: item, at: now };
      const e = item as Partial<CompanionEntry> | null;
      return e && typeof e.peerId === 'string' && typeof e.at === 'number' ? { peerId: e.peerId, at: e.at } : null;
    })
    .filter((e): e is CompanionEntry => !!e && now - e.at < COMPANION_LIFETIME_MS);
  // Stamp the old format once, so its entries expire like any other.
  if (list.some((item) => typeof item === 'string')) writeCompanions(entries);
  return entries;
}

function writeCompanions(entries: CompanionEntry[]): void {
  writeJson(COMPANIONS_KEY, entries.length ? entries : null);
}

/** Remember an agreed companion for the current journey. */
export function recordCompanion(userId: string): void {
  const entries = readCompanions().filter((e) => e.peerId !== userId);
  writeCompanions([...entries, { peerId: userId, at: Date.now() }]);
}

/** The companions recorded so far (read before the trip is closed). Someone
    blocked since, or agreed with too long ago, is not one any more. */
export const recordedCompanions = (): string[] =>
  readCompanions().map((e) => e.peerId).filter((id) => !blockStore.has(id));

/** They are not riding with me after all (agreement called off, journey over). */
export function forgetCompanion(userId: string): void {
  const entries = readCompanions();
  if (entries.some((e) => e.peerId === userId)) writeCompanions(entries.filter((e) => e.peerId !== userId));
}

const takeCompanions = (): string[] => {
  const ids = recordedCompanions();
  writeJson(COMPANIONS_KEY, null);
  return ids;
};

/** A picked route endpoint (label + coordinate), as the route sheet emits it. */
export interface RouteWaypoint { value?: string; latlng?: LatLng | null }

/** What a Live route started now would replace. The server calls off whatever
    journey of mine is under way, and my plans departing around now (see
    plansReplacedByLive). */
export interface GoingLive {
  /** A journey of mine that started and waits for its turn (useTripStarted). */
  waiting: TripDto | null;
  /** My open trips as last read (GET /trips/mine); null: unknown. */
  trips: readonly TripDto[] | null;
  now?: number;
}

/** The one question asked before going live, naming all it replaces — a plan by
    its route and local departure time. Null: it replaces nothing. */
export function goingLiveQuestion(waiting: TripDto | null, plans: readonly TripDto[]): ConfirmRequest | null {
  const [plan, ...more] = plans;
  if (!waiting && !plan) return null;
  const route = waiting ? tripLine(waiting) : '';
  const planned = plan ? { plan: tripLine(plan), time: fmt12(new Date(String(plan.departureTimeUtc))) } : null;
  let body = !planned ? t('route.replaceStartedBody', { route })
    : waiting ? t('route.replaceBothBody', { route, ...planned })
      : t('route.replacePlanBody', planned);
  if (more.length) body = `${body} ${t('route.replacePlansMore', { n: more.length })}`;
  return {
    title: t('route.replaceStartedTitle'), body,
    confirmLabel: t('route.replaceStartedOk'), cancelLabel: t('route.replaceStartedKeep'), danger: true,
  };
}

/** Before a Live route starts: asks once about all it replaces, and resolves
    whether to start it — false (the user keeps their trips): nothing starts.
    When it replaces nothing, nobody is asked. */
export async function confirmGoingLive({ waiting, trips, now = Date.now() }: GoingLive,
  ask: (question: ConfirmRequest) => Promise<boolean> = confirmAction): Promise<boolean> {
  // The waiting journey is named as the journey it is now, never also as a plan:
  // a list read before the server started it still has it as one.
  const plans = plansReplacedByLive(trips ?? [], now)
    .filter((plan) => !waiting || idOf(plan.id) !== idOf(waiting.id));
  const question = goingLiveQuestion(waiting, plans);
  return question ? ask(question) : true;
}

// ── "Start" in the route sheet ───────────────────────────────────

/** What a route start reads from the app — at the moment it acts. */
export interface RouteStartApp {
  /** My open trips as last read (GET /trips/mine; null: unknown). Read once the
      wait for the sheet's read is over: that read, or a newer one. */
  trips: () => readonly TripDto[] | null;
  /** A journey of mine that started and waits for its turn (useTripStarted). */
  waiting: () => TripDto | null;
  /** The role the map is in. */
  role: () => PartyType | null;
  /** Asks the user (default: the app's own dialog). */
  ask?: (question: ConfirmRequest) => Promise<boolean>;
}

/** How a tapped start ends. */
export type RouteStartOutcome =
  /** Nothing starts: the user left what it was tapped for meanwhile, or one is under way. */
  | { kind: 'void' }
  /** The user kept their trips: nothing starts. `journey`: a journey of mine waits — it goes on the map now. */
  | { kind: 'kept'; journey: boolean }
  /** Start it in `role` (read now — the role it was tapped in). `replaces`: the journey waiting by now, which it calls off. */
  | { kind: 'go'; role: PartyType | null; replaces: TripDto | null };

export interface RouteStarts {
  /** The route sheet opened, with the read of my trips it started (null: none). */
  opened: (read: Promise<unknown> | null) => void;
  /** The sheet changed the routes it shows: Back to the address form, another one picked. */
  routesChanged: () => void;
  /** The sheet is gone: closed, the map left, the role switched. */
  closed: () => void;
  /** "Start" tapped (`live`: a road route — what it replaces is asked about first).
      Waits for the sheet's read of my trips, then asks once (confirmGoingLive). */
  start: (live: boolean) => Promise<RouteStartOutcome>;
}

const VOID_START: RouteStartOutcome = { kind: 'void' };

/** The route sheet's "Start", without React. A start belongs to the moment it was
    tapped in — the sheet as it was (its routes, its read) and the role; it waits
    for that read (going live replaces my plans departing around now), and the
    user may walk away meanwhile. So each change of the sheet begins a new moment,
    and a start of an older one is void: it never starts, nor holds up a start
    tapped since. One start at a time; once one has gone, its moment starts nothing
    more (the sheet may not be gone yet). */
export function createRouteStarts(app: RouteStartApp): RouteStarts {
  let moment = 0;
  let read: Promise<unknown> | null = null; // the read of my trips the open sheet started
  let taken: number | null = null;          // the moment a start is under way in, or has gone in

  async function decide(mine: number, live: boolean): Promise<RouteStartOutcome> {
    const role = app.role();
    const current = () => moment === mine && app.role() === role;
    const sheetRead = read;
    if (live && sheetRead) await sheetRead.catch(() => undefined);
    if (!current()) return VOID_START;
    const ok = await confirmGoingLive({ waiting: live ? app.waiting() : null, trips: live ? app.trips() : null }, app.ask);
    if (!current()) return VOID_START; // walked away while asked
    // The journey waiting by now (a plan may have started while asked about):
    // kept, it goes on the map; else the new route calls it off with the rest.
    const waiting = live ? app.waiting() : null;
    if (!ok) return { kind: 'kept', journey: !!waiting };
    return { kind: 'go', role: app.role(), replaces: waiting };
  }

  return {
    opened(sheetRead) { moment += 1; read = sheetRead; },
    routesChanged() { moment += 1; },
    closed() { moment += 1; read = null; },
    async start(live) {
      const mine = moment;
      if (taken === mine) return VOID_START;
      taken = mine;
      let outcome = VOID_START;
      try {
        outcome = await decide(mine, live);
        return outcome;
      } finally {
        if (outcome.kind !== 'go' && taken === mine) taken = null;
      }
    },
  };
}

/** Persists the drawn route as a Live trip and records it as the session's
    active trip. Resolves to the trip id, or null if persisting failed. */
export async function createLiveTrip(route: OsrmRoute, coords: LatLng[], waypoints: RouteWaypoint[],
  role: PartyType): Promise<string | null> {
  try {
    const points = waypoints.filter((w) => w?.latlng);
    const from = points[0];
    const to = points[points.length - 1];
    const [oLat, oLng] = from?.latlng || coords[0];
    const [dLat, dLng] = to?.latlng || coords[coords.length - 1];
    const trip = await tripApi.create({
      origin: { latitude: oLat, longitude: oLng, address: from?.value || '' },
      destination: { latitude: dLat, longitude: dLng, address: to?.value || '' },
      departureTimeUtc: new Date().toISOString(),
      distanceKm: route.distance ? route.distance / 1000 : null,
      estimatedMinutes: route.duration ? Math.round(route.duration / 60) : null,
      notes: null,
      category: 'Live',
      role: role === 'driver' ? 'Driver' : 'Passenger',
    });
    if (trip?.id == null) return null;
    const id = String(trip.id);
    walkerStateStore.patch({ activeTripId: id });
    return id;
  } catch (e) {
    console.warn('[trip] live trip persist failed:', (e as Error)?.message || e);
    return null;
  }
}

/** Withdraws the shared route and closes the Live trip behind it — completed
    when the route ends, cancelled when the walker abandons the map. The close
    goes through the trip outbox, so it lands even if the network is down now. */
export function closeLiveTrip(tripId: string | null, outcome: 'complete' | 'cancel'): void {
  const companions = takeCompanions();
  if (USE_MOCKS) return;
  presenceClient.clearRoute().catch(() => {});
  if (!tripId) return;
  tripOutbox.enqueue(outcome === 'complete'
    ? { kind: 'complete', tripId, companionIds: companions }
    : { kind: 'cancel', tripId });
  if (walkerStateStore.get().activeTripId === tripId) walkerStateStore.patch({ clearActiveTrip: true });
}

/** "Band/to'ldi": withdraw from (or return to) discovery — the session flag,
    the live presence, and the visibility of the trip(s) given. */
export function publishBanded(banded: boolean, tripIds: string | null | readonly (string | null)[]): void {
  walkerStateStore.patch({ engaged: banded });
  if (USE_MOCKS) return;
  (banded ? presenceClient.markEngaged() : presenceClient.markAvailable()).catch(() => {});
  const ids = Array.isArray(tripIds) ? tripIds : [tripIds];
  new Set(ids.filter((id): id is string => !!id))
    .forEach((tripId) => tripOutbox.enqueue({ kind: banded ? 'hide' : 'show', tripId }));
}
