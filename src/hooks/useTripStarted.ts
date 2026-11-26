/* ════════════════════════════════════════════════════════════════
   useTripStarted — a journey of mine the server started goes on the map.
   ────────────────────────────────────────────────────────────────
   At a plan's departure time the server turns it into the journey under
   way and tells its owner (presence `TripEvent` "started"). This hook hands
   such a trip to the app: it goes on the map, or the user is told what keeps
   it off for now (services/tripResume decides) — and none is lost:

   • a start heard during the splash waits until the launch has settled;
   • one missed while the socket was down is found by reading my open trips
     again — when the hub is back, the device comes online or the app
     returns to view, and once after a launch that could not read them;
   • one that could not go on the map at once waits for its turn: it goes
     there as soon as nothing keeps it off any more (checked first — it may
     have been closed meanwhile).

   Each start is told once; a trip this device is closing is left out.
   ════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import { t } from '@/i18n';
import { USE_MOCKS } from '@/api/client';
import { authStore } from '@/services/authStore';
import { presenceClient } from '@/services/realtime';
import { onAppForeground } from '@/services/telegram';
import { AGREEMENT_EVENT } from '@/services/agreementStore';
import {
  catchUpTrip, closingTripIds, isInProgress, readOpenTrips, startedTripAction, startedTripHold, startedTripOf, tripLine, tripRole,
} from '@/services/tripResume';
import type { AppNow, LaunchPlan, StartedHold, TripDto, TripEvent } from '@/services/tripResume';
import { idOf } from '@/utils/ids';
import type { PartyType, PushNotif } from '@/models';

/** A launch that could not read my trips looks again this long after it. */
export const LAUNCH_CATCH_UP_MS = 5000;
/** Back in view, my trips are read again at most this often. */
export const FOREGROUND_CATCH_UP_MS = 30_000;
/** How long a waiting journey's turn waits for the check that it is still open. */
const TURN_CHECK_WAIT_MS = 4000;

/** What the flow reads from the app — at the moment it acts. */
export interface StartedTripsApp {
  /** Past the splash: the launch has settled my trips. */
  ready: () => boolean;
  now: () => AppNow;
  /** Put a journey of mine on the map, in its role. */
  resume: (trip: TripDto) => void;
  notify: (n: PushNotif) => void;
}

/** Why a fresh read of my trips was asked for. */
export type CatchUpReason = 'launch' | 'reconnect' | 'online' | 'foreground';

export interface StartedTrips {
  /** A start pushed by the server. */
  heard: (trip: TripDto) => void;
  /** The launch has settled: a start heard meanwhile is handed over now. */
  settled: () => void;
  /** Read my open trips again and hand over a start that was missed. */
  catchUp: (why: CatchUpReason) => Promise<void>;
  /** Something that kept the waiting journey off the map may have gone away. */
  recheck: () => Promise<void>;
  /** The launch's decisions: what it put on the map, what it only told, and
      whether to look again later. */
  launched: (plan: Pick<LaunchPlan, 'resume' | 'announce' | 'tell' | 'tellHold' | 'catchUp'>) => void;
  /** The journey waiting for its turn, if any. */
  waiting: () => TripDto | null;
  /** It is not going on the map (a new route replaces it — the server cancels it). */
  drop: () => void;
  /** The user switched to `role`: a waiting journey of another role waits until
      they are back in its role (the role they picked is not taken away). */
  roleChosen: (role: PartyType) => void;
  dispose: () => void;
}

/** "Your trip has started" — with what keeps it off the map for now (null: it is
    going on the map). */
export function startedToast(trip: TripDto, hold: StartedHold | null): PushNotif {
  const route = tripLine(trip);
  let body = route;
  if (hold === 'journey') body = t('push.tripStartedAfterRoute', { route });
  else if (hold === 'agreement') body = t('push.tripStartedAfterAgreement', { route });
  else if (hold) body = t('push.tripStartedSoon', { route });
  return { title: t('push.tripStartedTitle'), body, kind: 'info', priority: 'high' };
}

interface Waiting { trip: TripDto; keepRole: boolean }

/** The flow behind the hook, without React (the hook wires it to events). */
export function createStartedTrips(app: StartedTripsApp): StartedTrips {
  const handled = new Set<string>(); // each start is told once
  let waiting: Waiting | null = null;
  let held: TripDto | null = null;   // heard before the launch had settled
  let reading = false;
  let readAgain = false;
  let lastRead = 0;
  let lookAgain = false;             // the launch could not read my trips (or the linked one)
  let turnCheck = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const isClosing = (trip: TripDto) => closingTripIds().includes(idOf(trip.id));

  /** A start heard or found: on the map now, or told and kept for its turn. */
  function consider(trip: TripDto): void {
    const id = idOf(trip.id);
    if (!id || handled.has(id) || isClosing(trip)) return;
    handled.add(id);
    const now = app.now();
    const action = startedTripAction(trip, now);
    if (action === 'ignore') return;
    if (action === 'resume') {
      app.notify(startedToast(trip, null));
      app.resume(trip);
      return;
    }
    waiting = { trip, keepRole: false }; // the latest start waits; an older one gives way
    app.notify(startedToast(trip, startedTripHold(trip, now)));
  }

  async function catchUp(why: CatchUpReason): Promise<void> {
    if (!app.ready()) return;
    if (why === 'foreground' && !lookAgain && Date.now() - lastRead < FOREGROUND_CATCH_UP_MS) return;
    if (reading) { readAgain = true; return; }
    reading = true;
    const open = await readOpenTrips();
    reading = false;
    if (open.trips) {
      lastRead = Date.now();
      lookAgain = false;
      const trip = catchUpTrip(open, { handled, activeTripId: app.now().activeTripId });
      if (trip) consider(trip);
    }
    if (readAgain) {
      readAgain = false;
      await catchUp('reconnect');
    }
  }

  async function recheck(): Promise<void> {
    const entry = waiting;
    if (!entry || turnCheck || !app.ready()) return;
    const now = () => ({ ...app.now(), keepRole: entry.keepRole });
    const action = startedTripAction(entry.trip, now());
    if (action === 'tell') return;
    if (action === 'ignore') { waiting = null; return; } // it is on the map already
    // Its turn. It may have been closed meanwhile (another device, the server):
    // look first. Unknown (offline): as it was told, unless this device closes it.
    turnCheck = true;
    const open = await readOpenTrips(TURN_CHECK_WAIT_MS);
    turnCheck = false;
    if (waiting !== entry) return; // dropped or replaced meanwhile
    const trip = open.trips
      ? open.trips.find((row) => idOf(row.id) === idOf(entry.trip.id) && isInProgress(row)) ?? null
      : (isClosing(entry.trip) ? null : entry.trip);
    if (!trip) { waiting = null; return; }
    const next = startedTripAction(trip, now());
    if (next === 'tell') return; // something got in the way meanwhile: its next turn
    waiting = null;
    if (next === 'resume') app.resume(trip);
  }

  return {
    heard(trip) {
      if (isClosing(trip)) return;
      if (app.ready()) consider(trip);
      else held = trip;
    },
    settled() {
      const trip = held;
      held = null;
      if (trip) consider(trip);
    },
    catchUp,
    recheck,
    launched(plan) {
      [plan.resume, plan.tell].forEach((trip) => { if (trip) handled.add(idOf(trip.id)); });
      if (plan.resume && plan.announce) app.notify(startedToast(plan.resume, null));
      if (plan.tell) {
        waiting = { trip: plan.tell, keepRole: false };
        app.notify(startedToast(plan.tell, plan.tellHold ?? 'journey'));
      }
      if (!plan.catchUp) { lastRead = Date.now(); return; }
      lookAgain = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; void catchUp('launch'); }, LAUNCH_CATCH_UP_MS);
    },
    waiting: () => waiting?.trip ?? null,
    drop() { waiting = null; },
    roleChosen(role) {
      if (waiting) waiting.keepRole = tripRole(waiting.trip) !== role;
    },
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

interface UseTripStartedArgs {
  /** Signed in: listen from now on. */
  authReady: boolean;
  /** Past the splash — the launch has settled my trips. */
  ready: boolean;
  /** The app right now (read when a journey is to go on the map). */
  now: () => AppNow;
  /** Changes whenever something that can keep a journey off the map comes or goes. */
  blockers: string;
  resume: (trip: TripDto) => void;
  notify: (n: PushNotif) => void;
}

export function useTripStarted({ authReady, ready, now, blockers, resume, notify }: UseTripStartedArgs): StartedTrips {
  const appRef = useRef({ ready, now, resume, notify });
  appRef.current = { ready, now, resume, notify };
  const [flow] = useState(() => createStartedTrips({
    ready: () => appRef.current.ready,
    now: () => appRef.current.now(),
    resume: (trip) => appRef.current.resume(trip),
    notify: (n) => appRef.current.notify(n),
  }));

  // The server's push.
  useEffect(() => {
    if (USE_MOCKS || !authReady) return undefined;
    const off = presenceClient.on('TripEvent', (evt: TripEvent) => {
      const me = idOf((authStore.getUser() as { id?: string } | null)?.id ?? '');
      const trip = startedTripOf(evt, me);
      if (trip) flow.heard(trip);
    });
    return () => { off(); };
  }, [authReady, flow]);

  // A start missed while away: look again when the hub is back, the device is
  // online again or the app returns to view.
  useEffect(() => {
    if (USE_MOCKS || !authReady) return undefined;
    const offReconnected = presenceClient.on('Reconnected', () => { void flow.catchUp('reconnect'); });
    const offForeground = onAppForeground(() => { void flow.catchUp('foreground'); });
    const onOnline = () => { void flow.catchUp('online'); };
    window.addEventListener('online', onOnline);
    return () => {
      offReconnected();
      offForeground();
      window.removeEventListener('online', onOnline);
    };
  }, [authReady, flow]);

  useEffect(() => { if (ready) flow.settled(); }, [ready, flow]);

  // The waiting journey's turn: something that kept it off the map went away —
  // the app's state, or the agreement (it ends on its own).
  useEffect(() => { if (ready) void flow.recheck(); }, [ready, blockers, flow]);
  useEffect(() => {
    if (USE_MOCKS) return undefined;
    const onAgreement = () => { void flow.recheck(); };
    window.addEventListener(AGREEMENT_EVENT, onAgreement);
    return () => window.removeEventListener(AGREEMENT_EVENT, onAgreement);
  }, [flow]);

  useEffect(() => () => flow.dispose(), [flow]);

  return flow;
}
