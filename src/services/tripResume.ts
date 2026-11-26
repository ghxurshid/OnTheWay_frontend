/* ════════════════════════════════════════════════════════════════
   SERVICE — which of my trips goes (back) on the map.
   ────────────────────────────────────────────────────────────────
   The session's active trip is only the journey being travelled NOW
   (InProgress). A published plan waits on the server's board and is never
   the session's trip — the abandoned-session sweeper cancels that one with
   the session — until its departure time, when the SERVER starts it: the
   same record goes Scheduled → InProgress (its category stays "Planned").
   From then on it is a journey of mine like a route started here, and the
   app puts it on the map:

   - on launch: the session's own journey, else the one a bot link
     (`trip_<id>`) points at, else the one found in GET /trips/mine;
   - with the app open: presence `TripEvent` "started", or a start found by
     reading my trips again (one missed while the socket was down).

   A journey already on the map is never replaced on its own, nor does the
   map jump under something the user is in the middle of: the user is told,
   and the journey waits for its turn (see hooks/useTripStarted). Everything
   a published plan shows (the board's "your trip", "band" hiding it) is read
   from GET /trips/mine, not from the session.

   This module only decides; App applies it.
   ════════════════════════════════════════════════════════════════ */

import { tripApi } from '@/api/tripApi';
import { START_GRACE_MINUTES } from '@/constants/app';
import { tripOutbox } from '@/services/tripOutbox';
import { idOf } from '@/utils/ids';
import type { PartyType } from '@/models';

/** A trip as the server sends it (TripResponseDto) — what resuming reads. */
export interface TripDto {
  id: string | number;
  /** The owner, whatever the trip's role. */
  driverId?: string | number | null;
  status?: string | null;
  category?: string | null;
  role?: string | null;
  /** False on a waiting plan its owner hid ("band"); always false once under way. */
  isVisible?: boolean;
  departureTimeUtc?: string | null;
  origin?: { latitude?: number; longitude?: number; address?: string } | null;
  destination?: { latitude?: number; longitude?: number; address?: string } | null;
}

/** The presence hub's TripEvent, as far as a started trip goes. */
export interface TripEvent { type?: string; trip?: TripDto | null }

const lower = (value: unknown): string => String(value ?? '').toLowerCase();
const sameId = (a: unknown, b: unknown): boolean => idOf(a) !== '' && idOf(a) === idOf(b);
const departure = (trip: TripDto): number => Date.parse(String(trip.departureTimeUtc ?? '')) || 0;

/** Under way: a route started in the app, or a plan the server started. */
export const isInProgress = (trip: TripDto | null | undefined): boolean => lower(trip?.status) === 'inprogress';

/** A plan still waiting for its departure time. */
export const isScheduled = (trip: TripDto | null | undefined): boolean => lower(trip?.status) === 'scheduled';

/** The role a trip is travelled in (the app's mode while it is on the map). */
export const tripRole = (trip: TripDto): PartyType => (lower(trip.role) === 'passenger' ? 'passenger' : 'driver');

/** "Chilonzor → Yunusobod": where a trip goes, for a toast. */
export const tripLine = (trip: TripDto): string =>
  `${trip.origin?.address || '—'} → ${trip.destination?.address || '—'}`;

/** Of several journeys under way, the one that set off last is the current one. */
const latest = (trips: TripDto[]): TripDto | null =>
  trips.reduce<TripDto | null>((best, trip) => (!best || departure(trip) >= departure(best) ? trip : best), null);

// ── My open trips ────────────────────────────────────────────────

/** GET /trips/mine without the trips this device has already closed. */
export interface OpenTrips {
  /** Null when they could not be read (offline, too slow). */
  trips: TripDto[] | null;
  /** Trips closed here whose close the server may not have yet. */
  closing: string[];
}

/** How long a launch waits for GET /trips/mine before going on without it. */
export const OPEN_TRIPS_WAIT_MS = 6000;

/** Trips finished or called off on this device whose close is still queued or in flight. */
export const closingTripIds = (): string[] => tripOutbox.pending()
  .filter((c) => c.kind === 'complete' || c.kind === 'cancel')
  .map((c) => idOf(c.tripId));

const myTripsListeners = new Set<(trips: TripDto[]) => void>();

/** Follow every read of my open trips — the launch, a catch-up, My trips, the
    board — e.g. for the plan "band" acts on. Returns an unsubscribe. */
export function onMyTrips(fn: (trips: TripDto[]) => void): () => void {
  myTripsListeners.add(fn);
  return () => { myTripsListeners.delete(fn); };
}

/** Tells the followers what GET /trips/mine has just listed (the trips this
    device is closing left out). Nothing is told when the read failed. */
export function reportMyTrips(rows: readonly TripDto[] | null | undefined): void {
  if (!Array.isArray(rows)) return;
  const closing = new Set(closingTripIds());
  const trips = rows.filter((trip) => !closing.has(idOf(trip.id)));
  myTripsListeners.forEach((fn) => {
    try { fn(trips); } catch (e) { console.error('[myTrips]', e); }
  });
}

/** Reads my open trips. A trip finished or called off on this device is left out
    even while its close is still queued or in flight (the outbox is looked at
    before the request and after it), so it is never brought back. Never rejects. */
export async function readOpenTrips(waitMs: number = OPEN_TRIPS_WAIT_MS): Promise<OpenTrips> {
  const closing = new Set(closingTripIds());
  let rows: TripDto[] | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    rows = await Promise.race([
      tripApi.mine() as Promise<TripDto[] | null>,
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), waitMs); }),
    ]);
  } catch {
    /* offline / server down: unknown — the launch goes on without them */
  } finally {
    clearTimeout(timer);
  }
  closingTripIds().forEach((id) => closing.add(id));
  const trips = Array.isArray(rows) ? rows.filter((trip) => !closing.has(idOf(trip.id))) : null;
  reportMyTrips(trips);
  return { trips, closing: [...closing] };
}

// ── "Band" and my plan ───────────────────────────────────────────

/** The plan "band" acts on: one I hid (so that it can be shown again), else the
    soonest one waiting (GET /trips/mine lists the soonest first). */
export const bandPlanOf = (trips: readonly TripDto[]): TripDto | null =>
  trips.find((trip) => isScheduled(trip) && trip.isVisible === false) ?? trips.find(isScheduled) ?? null;

/** `bandPlanOf` as an id (null: no plan waiting). */
export const bandPlanIdOf = (trips: readonly TripDto[]): string | null => {
  const plan = bandPlanOf(trips);
  return plan ? idOf(plan.id) : null;
};

/** The trips "band" changes. On: the journey under way, else my plan on the
    board. Off: both — a plan hidden earlier is shown again too. */
export function bandTargets(on: boolean, journeyId: string | null | undefined, planId: string | null | undefined): string[] {
  const ids = on ? [journeyId || planId] : [journeyId, planId];
  return [...new Set(ids.filter((id): id is string => !!id))];
}

/** A launch could not read my trips, and now they are read: whether I still have
    one, and whether "band" (kept as the session had it) must go — it cannot hold
    without a trip. `journey`: a journey is on the map meanwhile. */
export function settleLate(trips: readonly TripDto[], { journey, banded }: { journey: boolean; banded: boolean }):
  { hasOpenTrip: boolean; unband: boolean } {
  const hasOpenTrip = journey || trips.length > 0;
  return { hasOpenTrip, unband: banded && !hasOpenTrip };
}

// ── Going live ───────────────────────────────────────────────────

/** The plans of mine a Live trip created at `now` replaces. Going live in the hour
    around a plan's departure is travelling that plan now: the server cancels,
    silently, every plan of mine still waiting whose departure is at most
    START_GRACE_MINUTES before or after now, whatever its role. Soonest first. */
export function plansReplacedByLive(trips: readonly TripDto[], now: number = Date.now()): TripDto[] {
  const graceMs = START_GRACE_MINUTES * 60_000;
  return trips
    .filter((trip) => isScheduled(trip) && Math.abs(departure(trip) - now) <= graceMs)
    .sort((a, b) => departure(a) - departure(b));
}

// ── A journey of mine under way: on the map now, or later ───────

/** The app when a journey of mine is to go on the map. */
export interface AppNow {
  /** The journey on the map (its trip id), if any. */
  activeTripId: string | null;
  /** A route of mine is on the map (its trip may not be saved yet). */
  routeOnMap?: boolean;
  /** The user is in the middle of something the map must not change under: a
      route being set up, a point being picked on the map, a call. */
  busy: boolean;
  /** The role the app is in (null: none chosen yet). */
  mode: PartyType | null;
  /** A "ride together" agreement is up — it belongs to the current role. */
  agreement: boolean;
  /** The user picked this role after the journey was told: it waits for its own. */
  keepRole?: boolean;
}

/** Why a journey of mine is not put on the map now: another journey is there,
    the user is busy, an agreement of the current role would be left behind by
    the role switch, or the user chose this role after it was told. */
export type StartedHold = 'journey' | 'busy' | 'agreement' | 'role';

/** What keeps `trip` off the map right now (null: nothing). */
export function startedTripHold(trip: TripDto, now: AppNow): StartedHold | null {
  if (now.activeTripId || now.routeOnMap) return 'journey';
  if (now.busy) return 'busy';
  const otherRole = !!now.mode && now.mode !== tripRole(trip);
  if (otherRole && now.agreement) return 'agreement';
  if (otherRole && now.keepRole) return 'role';
  return null;
}

/** What a journey of mine that is under way does to the app: 'resume' puts it on
    the map (in its role); while something keeps it off (see startedTripHold) the
    user is only told ('tell'); the journey that is on the map already is ignored. */
export function startedTripAction(trip: TripDto, now: AppNow): 'ignore' | 'resume' | 'tell' {
  if (sameId(trip.id, now.activeTripId)) return 'ignore';
  return startedTripHold(trip, now) ? 'tell' : 'resume';
}

// ── Launch ───────────────────────────────────────────────────────

export interface LaunchInput {
  /** The retained session's active trip (GetWalkerState), if it has one. */
  sessionTrip?: TripDto | null;
  /** `readOpenTrips()` of this launch (null: not read — demo mode). */
  open?: OpenTrips | null;
  /** The session's "band" flag, as restored. */
  engaged?: boolean;
  /** The trip a bot link (`trip_<id>`) opened the app on. */
  linkedTripId?: string | null;
  /** The role the app opens in without a journey (the one an agreement up is shown in). */
  role?: PartyType | null;
  /** A "ride together" agreement is up (restored with the session). */
  agreement?: boolean;
}

export interface LaunchPlan {
  /** The journey to put back on the map, in its role — or null. */
  resume: TripDto | null;
  /** That journey is not the session's: the server started a plan of mine while
      the app was closed — say so. */
  announce: boolean;
  /** A trip of mine is still open: a waiting plan, or a journey. While my trips are
      unknown, what the session says (its trip, its "band"). */
  hasOpenTrip: boolean;
  /** The plan "band" acts on (see bandPlanOf). */
  plannedTripId: string | null;
  /** "Band" holds: with a journey resumed, as the session has it; otherwise while I
      have a trip and the session or my hidden plan says so. Null: my trips are
      unknown — keep the session's flag and publish nothing. */
  banded: boolean | null;
  /** My plan is hidden while "band" is off (it was turned off with a journey on
      the map): show it again. */
  showPlanId: string | null;
  /** The link points at my plan that is still waiting: open My trips. */
  openMyTrips: boolean;
  /** Another journey of mine under way that is not put on the map — the user is
      told, and it waits for its turn. */
  tell: TripDto | null;
  /** What keeps `tell` off the map. */
  tellHold: StartedHold | null;
  /** My trips (or the linked one) could not be read: look again once the
      connection is back. */
  catchUp: boolean;
}

/** What a launch does about my trips. A link to a trip that is closed, not mine
    or unknown changes nothing (GET /trips/mine lists only my open ones). */
export function planLaunch({
  sessionTrip, open, engaged = false, linkedTripId, role = null, agreement = false,
}: LaunchInput): LaunchPlan {
  const known = Array.isArray(open?.trips);
  const unknown = !!open && !known; // read, without an answer
  const trips = open?.trips ?? [];
  const closing = open?.closing ?? [];
  const session = sessionTrip && !closing.some((id) => sameId(id, sessionTrip.id)) ? sessionTrip : null;
  const journey = isInProgress(session) ? session : null;
  const linked = linkedTripId ? trips.find((trip) => sameId(trip.id, linkedTripId)) ?? null : null;
  // Another journey of mine under way (a plan the server started): the linked one,
  // else the one that set off last. It goes on the map by the rules that apply
  // with the app open — not over the session's journey, nor away from the role an
  // agreement belongs to.
  const isOther = (trip: TripDto | null): trip is TripDto => !!trip && isInProgress(trip) && !sameId(trip.id, journey?.id);
  const other = (isOther(linked) ? linked : null) ?? latest(trips.filter(isOther));
  const hold: StartedHold | null = !other ? null
    : journey ? 'journey' : startedTripHold(other, { activeTripId: null, busy: false, mode: role, agreement });
  const resume = journey ?? (hold ? null : other);
  // GET /trips/mine is the truth about my plans; only while it could not be read
  // does a plan an older client left as the session's trip still count.
  const planned = bandPlanOf(trips) ?? (!known && isScheduled(session) ? session : null);
  const hasOpenTrip = !!resume || !!planned || trips.length > 0 || (unknown && engaged);
  const banded = unknown ? null : resume ? engaged : hasOpenTrip && (engaged || planned?.isVisible === false);
  return {
    resume,
    announce: !!resume && !journey && lower(resume.category) === 'planned',
    hasOpenTrip,
    plannedTripId: planned ? idOf(planned.id) : null,
    banded,
    showPlanId: banded === false && planned && isScheduled(planned) && planned.isVisible === false ? idOf(planned.id) : null,
    openMyTrips: isScheduled(linked),
    tell: hold ? other : null,
    tellHold: hold,
    catchUp: unknown || (known && !!linkedTripId && !linked),
  };
}

// ── With the app open ────────────────────────────────────────────

/** The trip of mine the server has just started (TripEvent "started") — or null
    for any other event, someone else's trip, or one that is not under way. */
export function startedTripOf(evt: TripEvent | null | undefined, myId: string): TripDto | null {
  const trip = evt?.type === 'started' ? evt.trip : null;
  return trip && sameId(trip.driverId, myId) && isInProgress(trip) ? trip : null;
}

/** The journey of mine under way a fresh read of my trips hands over: the one that
    set off last among those neither on the map nor handled before (each start is
    told once). */
export function catchUpTrip(open: OpenTrips, { handled, activeTripId }:
  { handled: ReadonlySet<string>; activeTripId: string | null }): TripDto | null {
  return latest((open.trips ?? []).filter((trip) =>
    isInProgress(trip) && !sameId(trip.id, activeTripId) && !handled.has(idOf(trip.id))));
}
