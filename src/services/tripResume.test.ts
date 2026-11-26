import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OPEN_TRIPS_WAIT_MS, bandPlanIdOf, bandPlanOf, bandTargets, catchUpTrip, closingTripIds, isInProgress, isScheduled,
  onMyTrips, planLaunch, plansReplacedByLive, readOpenTrips, reportMyTrips, settleLate, startedTripAction, startedTripHold,
  startedTripOf, tripLine, tripRole,
} from './tripResume';
import type { AppNow, OpenTrips, TripDto } from './tripResume';
import { START_GRACE_MINUTES } from '@/constants/app';

const api = vi.hoisted(() => ({ mine: vi.fn() }));
vi.mock('@/api/tripApi', () => ({ tripApi: api }));
const outbox = vi.hoisted(() => ({ queue: [] as Array<Record<string, unknown>> }));
vi.mock('@/services/tripOutbox', () => ({ tripOutbox: { pending: () => outbox.queue } }));

// REST sends numeric ids; the outbox and the app keep strings.
const plan = (id: number, over: Partial<TripDto> = {}): TripDto => ({
  id, driverId: 9, status: 'Scheduled', category: 'Planned', role: 'Driver', isVisible: true,
  departureTimeUtc: '2026-11-25T08:00:00Z',
  origin: { latitude: 41.3, longitude: 69.2, address: 'Chilonzor' },
  destination: { latitude: 41.35, longitude: 69.29, address: 'Yunusobod' },
  ...over,
});
const started = (id: number, over: Partial<TripDto> = {}) => plan(id, { status: 'InProgress', isVisible: false, ...over });
const live = (id: number, over: Partial<TripDto> = {}) => started(id, { category: 'Live', ...over });
const open = (trips: TripDto[] | null, closing: string[] = []): OpenTrips => ({ trips, closing });
const ids = (trips: TripDto[] | null) => (trips || []).map((trip) => trip.id);

beforeEach(() => {
  api.mine.mockReset();
  outbox.queue = [];
});
afterEach(() => { vi.useRealTimers(); });

describe('readOpenTrips', () => {
  it('leaves out the trips this device is closing — queued before the request or during it', async () => {
    outbox.queue = [{ kind: 'cancel', tripId: '5' }, { kind: 'hide', tripId: '6' }, { kind: 'rate', tripId: '8', rateeId: '7', stars: 5, tags: [] }];
    api.mine.mockImplementation(async () => {
      // Meanwhile the cancel of 5 went through and 7 was finished here.
      outbox.queue = [{ kind: 'complete', tripId: '7', companionIds: [] }];
      return [plan(5), plan(6), started(7), live(8)];
    });

    const result = await readOpenTrips();

    expect(ids(result.trips)).toEqual([6, 8]);
    expect([...result.closing].sort()).toEqual(['5', '7']);
    expect(closingTripIds()).toEqual(['7']);
  });

  it('is unknown (null) when GET /trips/mine fails', async () => {
    api.mine.mockRejectedValue(new Error('Failed to fetch'));

    await expect(readOpenTrips()).resolves.toEqual({ trips: null, closing: [] });
  });

  it('is unknown (null) when the server is too slow, and a late failure is harmless', async () => {
    vi.useFakeTimers();
    api.mine.mockReturnValue(new Promise((_, reject) => { setTimeout(() => reject(new Error('late')), OPEN_TRIPS_WAIT_MS + 5000); }));

    const pending = readOpenTrips();
    await vi.advanceTimersByTimeAsync(OPEN_TRIPS_WAIT_MS);
    await expect(pending).resolves.toEqual({ trips: null, closing: [] });
    await vi.advanceTimersByTimeAsync(10_000); // the late rejection lands nowhere
  });

  it('tells the followers of my trips what it read — nothing when it could not read them', async () => {
    const heard = vi.fn();
    const off = onMyTrips(heard);
    api.mine.mockResolvedValueOnce([plan(5)]).mockRejectedValueOnce(new Error('offline'));

    await readOpenTrips();
    await readOpenTrips();
    off();

    expect(heard).toHaveBeenCalledTimes(1);
    expect(ids(heard.mock.calls[0][0])).toEqual([5]);
  });
});

describe('the reads of my trips', () => {
  it('reach every follower without the trips this device is closing, until unsubscribed', () => {
    const a = vi.fn();
    const off = onMyTrips(a);
    outbox.queue = [{ kind: 'cancel', tripId: '6' }];

    reportMyTrips([plan(5), plan(6)]);
    reportMyTrips(null); // a failed read says nothing
    off();
    reportMyTrips([plan(7)]);

    expect(a).toHaveBeenCalledTimes(1);
    expect(ids(a.mock.calls[0][0])).toEqual([5]);
  });

  it('a failing follower does not keep the others from hearing', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = onMyTrips(() => { throw new Error('boom'); });
    const good = vi.fn();
    const off = onMyTrips(good);

    reportMyTrips([plan(5)]);
    bad();
    off();

    expect(good).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
});

describe('"band" and my plan', () => {
  it('acts on the plan I hid rather than the soonest — so it can be shown again', () => {
    const trips = [started(3), plan(4), plan(5, { isVisible: false })];
    expect(bandPlanOf(trips)?.id).toBe(5);
    expect(bandPlanIdOf(trips)).toBe('5');
    expect(bandPlanIdOf([started(3), plan(4), plan(6)])).toBe('4'); // none hidden: the soonest
    expect(bandPlanIdOf([started(3), live(8)])).toBeNull();          // journeys are not plans
  });

  it('on: hides the journey under way, else my plan; off: shows both again', () => {
    expect(bandTargets(true, '12', '5')).toEqual(['12']);
    expect(bandTargets(true, null, '5')).toEqual(['5']);
    expect(bandTargets(false, '12', '5')).toEqual(['12', '5']);
    expect(bandTargets(false, null, '5')).toEqual(['5']);
    expect(bandTargets(false, '5', '5')).toEqual(['5']);
    expect(bandTargets(true, null, null)).toEqual([]);
  });

  it('a launch that could not read my trips: the first read keeps "band" only with a trip', () => {
    expect(settleLate([], { journey: false, banded: true })).toEqual({ hasOpenTrip: false, unband: true });
    expect(settleLate([], { journey: false, banded: false })).toEqual({ hasOpenTrip: false, unband: false });
    expect(settleLate([], { journey: true, banded: true })).toEqual({ hasOpenTrip: true, unband: false });
    expect(settleLate([plan(5)], { journey: false, banded: true })).toEqual({ hasOpenTrip: true, unband: false });
  });
});

describe('going live', () => {
  const NOW = Date.parse('2026-11-25T08:00:00Z');
  const departing = (minutes: number, ms = 0) => new Date(NOW + minutes * 60_000 + ms).toISOString();

  it('replaces my plans departing within the server’s start window either side of now — its edges included', () => {
    expect(START_GRACE_MINUTES).toBe(60); // Trips:StartGraceMinutes
    const trips = [
      plan(1, { departureTimeUtc: departing(-START_GRACE_MINUTES) }),
      plan(2, { departureTimeUtc: departing(START_GRACE_MINUTES) }),
      plan(3, { departureTimeUtc: departing(-START_GRACE_MINUTES, -1) }),
      plan(4, { departureTimeUtc: departing(START_GRACE_MINUTES, 1) }),
      plan(5, { departureTimeUtc: departing(0) }),
    ];

    expect(ids(plansReplacedByLive(trips, NOW))).toEqual([1, 5, 2]); // soonest first
  });

  it('counts a plan of the other role too, and a hidden one', () => {
    const trips = [
      plan(1, { role: 'Passenger', departureTimeUtc: departing(20) }),
      plan(2, { role: 'Driver', isVisible: false, departureTimeUtc: departing(-10) }),
    ];

    expect(ids(plansReplacedByLive(trips, NOW))).toEqual([2, 1]);
  });

  it('leaves out what is not a plan still waiting, and a departure it cannot read', () => {
    const trips = [
      started(1, { departureTimeUtc: departing(-5) }),
      live(2, { departureTimeUtc: departing(0) }),
      plan(3, { status: 'Cancelled', departureTimeUtc: departing(5) }),
      plan(4, { departureTimeUtc: null }),
      plan(5, { departureTimeUtc: 'soon' }),
    ];

    expect(plansReplacedByLive(trips, NOW)).toEqual([]);
    expect(plansReplacedByLive([], NOW)).toEqual([]);
  });
});

describe('planLaunch', () => {
  it('resumes the session’s journey under way; my waiting plan stays on the board', () => {
    const p = planLaunch({ sessionTrip: live(1), open: open([live(1), plan(2)]) });

    expect(p.resume?.id).toBe(1);
    expect(p).toMatchObject({
      announce: false, hasOpenTrip: true, plannedTripId: '2', openMyTrips: false, tell: null, tellHold: null, banded: false, catchUp: false,
    });
  });

  it('never resumes a plan that is still waiting — not even one an older client left in the session', () => {
    const p = planLaunch({ sessionTrip: plan(2), open: open([plan(2)]) });

    expect(p.resume).toBeNull();
    expect(p).toMatchObject({ hasOpenTrip: true, plannedTripId: '2' });
  });

  it('counts that older session plan only while my trips could not be read', () => {
    expect(planLaunch({ sessionTrip: plan(2), open: open(null) })).toMatchObject({ resume: null, hasOpenTrip: true, plannedTripId: '2' });
    expect(planLaunch({ sessionTrip: plan(2), open: open([]) })).toMatchObject({ resume: null, hasOpenTrip: false, plannedTripId: null });
  });

  it('resumes a plan the server started (the one that set off last) and says so', () => {
    const p = planLaunch({
      open: open([started(3, { departureTimeUtc: '2026-11-25T07:00:00Z' }), started(4, { departureTimeUtc: '2026-11-25T08:00:00Z' }), plan(5)]),
    });

    expect(p.resume?.id).toBe(4);
    expect(p).toMatchObject({ announce: true, plannedTripId: '5', hasOpenTrip: true, tell: null });
  });

  it('announces only a started plan, not a Live route of mine found in the list', () => {
    const p = planLaunch({ open: open([live(8)]) });

    expect(p.resume?.id).toBe(8);
    expect(p.announce).toBe(false);
  });

  it('does not announce the session’s own journey again — even a plan the server started', () => {
    const p = planLaunch({ sessionTrip: started(3), open: open([started(3)]) });

    expect(p.resume?.id).toBe(3);
    expect(p).toMatchObject({ announce: false, tell: null });
  });

  it('does not bring back a journey this device is closing', () => {
    const p = planLaunch({ sessionTrip: live(1), open: open([], ['1']) });

    expect(p).toMatchObject({ resume: null, hasOpenTrip: false, banded: false });
  });

  it('a link to my started trip puts that one on the map', () => {
    const p = planLaunch({
      linkedTripId: '3',
      open: open([started(3, { departureTimeUtc: '2026-11-25T07:00:00Z' }), started(4, { departureTimeUtc: '2026-11-25T08:00:00Z' })]),
    });

    expect(p.resume?.id).toBe(3);
    expect(p).toMatchObject({ announce: true, tell: null, openMyTrips: false, catchUp: false });
  });

  it('a link to my started trip while the session’s journey goes on: told, not swapped in', () => {
    const p = planLaunch({ sessionTrip: live(1), linkedTripId: '3', open: open([live(1), started(3)]) });

    expect(p.resume?.id).toBe(1);
    expect(p.tell?.id).toBe(3);
    expect(p).toMatchObject({ announce: false, tellHold: 'journey' });
  });

  it('a plan the server started while the session’s journey goes on is told too, without a link', () => {
    const p = planLaunch({ sessionTrip: live(1), open: open([live(1), started(3)]) });

    expect(p.resume?.id).toBe(1);
    expect(p.tell?.id).toBe(3);
    expect(p.tellHold).toBe('journey');
  });

  it('a plan started in the other role waits while an agreement of mine is up (told); in my role it goes on the map', () => {
    const asPassenger = started(3, { role: 'Passenger' });

    const held = planLaunch({ open: open([asPassenger]), role: 'driver', agreement: true });
    expect(held.resume).toBeNull();
    expect(held.tell?.id).toBe(3);
    expect(held).toMatchObject({ tellHold: 'agreement', announce: false, hasOpenTrip: true });

    expect(planLaunch({ open: open([started(3)]), role: 'driver', agreement: true }).resume?.id).toBe(3);
    expect(planLaunch({ open: open([asPassenger]), role: 'driver', agreement: false }).resume?.id).toBe(3);
  });

  it('a link to my plan that is still waiting opens My trips', () => {
    const p = planLaunch({ linkedTripId: '5', open: open([plan(5)]) });

    expect(p).toMatchObject({ resume: null, openMyTrips: true, tell: null, plannedTripId: '5', catchUp: false });
  });

  it('a link to a closed, foreign or unknown trip changes nothing — the trips are only looked at again later', () => {
    expect(planLaunch({ linkedTripId: '99', open: open([plan(5)]) }))
      .toMatchObject({ resume: null, openMyTrips: false, tell: null, hasOpenTrip: true, catchUp: true });
    expect(planLaunch({ linkedTripId: '5', open: open([], ['5']) })).toMatchObject({ openMyTrips: false, hasOpenTrip: false, catchUp: true });
    expect(planLaunch({ linkedTripId: '3', open: open(null) }))
      .toMatchObject({ resume: null, openMyTrips: false, tell: null, hasOpenTrip: false, catchUp: true });
  });

  it('"band" holds while I have a trip and the session — or my hidden plan — says so', () => {
    expect(planLaunch({ engaged: true, open: open([plan(5)]) }).banded).toBe(true);
    expect(planLaunch({ engaged: false, open: open([plan(5, { isVisible: false })]) }).banded).toBe(true);
    expect(planLaunch({ engaged: false, open: open([plan(5)]) }).banded).toBe(false);
    expect(planLaunch({ engaged: true, open: open([]) }).banded).toBe(false);
  });

  it('with a journey resumed "band" is as the session has it: turned off, my hidden plan shows again', () => {
    const off = planLaunch({ engaged: false, sessionTrip: live(1), open: open([live(1), plan(5, { isVisible: false })]) });
    expect(off).toMatchObject({ banded: false, showPlanId: '5', plannedTripId: '5' });

    const on = planLaunch({ engaged: true, sessionTrip: live(1), open: open([live(1), plan(5, { isVisible: false })]) });
    expect(on).toMatchObject({ banded: true, showPlanId: null });

    // Without a journey a hidden plan keeps "band" on — nothing to show.
    expect(planLaunch({ engaged: false, open: open([plan(5, { isVisible: false })]) }).showPlanId).toBeNull();
  });

  it('my trips unknown: no "band" decision, the session’s flag says whether I have a trip, and they are read again', () => {
    expect(planLaunch({ engaged: true, open: open(null) })).toMatchObject({ banded: null, hasOpenTrip: true, catchUp: true, showPlanId: null });
    expect(planLaunch({ engaged: false, open: open(null) })).toMatchObject({ banded: null, hasOpenTrip: false, catchUp: true });
    // The session's own journey still goes on the map.
    expect(planLaunch({ engaged: true, sessionTrip: live(1), open: open(null) })).toMatchObject({ banded: null, hasOpenTrip: true });
    expect(planLaunch({ sessionTrip: live(1), open: open(null) }).resume?.id).toBe(1);
  });

  it('plans nothing when nothing was read (demo mode)', () => {
    expect(planLaunch({})).toEqual({
      resume: null, announce: false, hasOpenTrip: false, plannedTripId: null, banded: false, showPlanId: null,
      openMyTrips: false, tell: null, tellHold: null, catchUp: false,
    });
    expect(planLaunch({ engaged: true }).hasOpenTrip).toBe(false); // the demo's own flag proves nothing
  });
});

describe('a journey of mine under way, with the app open', () => {
  const evt = (over: Partial<TripDto> = {}, type = 'started') => ({ type, actorUserId: 9, trip: started(501, over) });

  it('is mine only when it is my trip, started and under way', () => {
    expect(startedTripOf(evt(), '9')?.id).toBe(501);
    expect(startedTripOf(evt({}, 'completed'), '9')).toBeNull();
    expect(startedTripOf(evt({ driverId: 7 }), '9')).toBeNull();
    expect(startedTripOf(evt({ status: 'Scheduled' }), '9')).toBeNull();
    expect(startedTripOf(evt(), '')).toBeNull();
    expect(startedTripOf({ type: 'started', trip: null }, '9')).toBeNull();
    expect(startedTripOf(null, '9')).toBeNull();
  });

  const now = (over: Partial<AppNow> = {}): AppNow => ({ activeTripId: null, busy: false, mode: 'driver', agreement: false, ...over });

  it('goes on the map when nothing else is there', () => {
    expect(startedTripAction(started(501), now())).toBe('resume');
    expect(startedTripAction(started(501), now({ mode: null, agreement: true }))).toBe('resume');
  });

  it('is ignored when it is the journey on the map already', () => {
    expect(startedTripAction(started(501), now({ activeTripId: '501' }))).toBe('ignore');
  });

  it('is only told with another journey on the map, or while the user is busy', () => {
    expect(startedTripAction(started(501), now({ activeTripId: '12' }))).toBe('tell');
    expect(startedTripAction(started(501), now({ routeOnMap: true }))).toBe('tell');
    expect(startedTripAction(started(501), now({ busy: true }))).toBe('tell');
  });

  it('switches the role for it — unless that would leave an agreement behind', () => {
    const asPassenger = started(501, { role: 'Passenger' });
    expect(startedTripAction(asPassenger, now())).toBe('resume');
    expect(startedTripAction(asPassenger, now({ agreement: true }))).toBe('tell');
    expect(startedTripAction(started(501), now({ agreement: true }))).toBe('resume'); // same role: the agreement may be for this trip
  });

  it('says what keeps it off the map', () => {
    const asPassenger = started(501, { role: 'Passenger' });
    expect(startedTripHold(started(501), now({ activeTripId: '12', busy: true }))).toBe('journey');
    expect(startedTripHold(started(501), now({ routeOnMap: true }))).toBe('journey');
    expect(startedTripHold(started(501), now({ busy: true, agreement: true }))).toBe('busy');
    expect(startedTripHold(asPassenger, now({ agreement: true }))).toBe('agreement');
    expect(startedTripHold(asPassenger, now({ keepRole: true }))).toBe('role');
    expect(startedTripHold(started(501), now({ keepRole: true }))).toBeNull(); // its own role is not kept from it
    expect(startedTripHold(asPassenger, now({ mode: null, keepRole: true }))).toBeNull();
  });

  it('a fresh read hands over the latest start neither on the map nor handled before', () => {
    const rows = open([
      live(12, { departureTimeUtc: '2026-11-25T09:00:00Z' }),
      started(501, { departureTimeUtc: '2026-11-25T07:00:00Z' }),
      started(502, { departureTimeUtc: '2026-11-25T08:00:00Z' }),
      plan(6),
    ]);

    expect(catchUpTrip(rows, { handled: new Set(), activeTripId: '12' })?.id).toBe(502);
    expect(catchUpTrip(rows, { handled: new Set(['502']), activeTripId: '12' })?.id).toBe(501);
    expect(catchUpTrip(rows, { handled: new Set(['501', '502']), activeTripId: '12' })).toBeNull();
    expect(catchUpTrip(open(null), { handled: new Set(), activeTripId: null })).toBeNull();
  });
});

describe('trip helpers', () => {
  it('read status and role whatever their case', () => {
    expect(isInProgress({ id: 1, status: 'InProgress' })).toBe(true);
    expect(isInProgress({ id: 1, status: 'inprogress' })).toBe(true);
    expect(isScheduled({ id: 1, status: 'SCHEDULED' })).toBe(true);
    expect(isScheduled(null)).toBe(false);
    expect(tripRole({ id: 1, role: 'Passenger' })).toBe('passenger');
    expect(tripRole({ id: 1, role: 'Driver' })).toBe('driver');
    expect(tripRole({ id: 1 })).toBe('driver');
  });

  it('describe where a trip goes, with a dash for a missing address', () => {
    expect(tripLine(plan(1))).toBe('Chilonzor → Yunusobod');
    expect(tripLine({ id: 1, origin: null, destination: { address: '' } })).toBe('— → —');
  });
});
