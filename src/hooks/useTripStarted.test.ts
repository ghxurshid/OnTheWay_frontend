import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { i18nStore, t } from '@/i18n';
import { AGREEMENT_EVENT } from '@/services/agreementStore';
import type { AppNow, TripDto } from '@/services/tripResume';
import { FOREGROUND_CATCH_UP_MS, LAUNCH_CATCH_UP_MS, createStartedTrips, startedToast, useTripStarted } from './useTripStarted';

const hub = vi.hoisted(() => ({ handlers: new Map<string, Set<(payload: unknown) => unknown>>() }));
vi.mock('@/services/realtime', () => ({
  presenceClient: {
    on: (event: string, fn: (payload: unknown) => unknown) => {
      if (!hub.handlers.has(event)) hub.handlers.set(event, new Set());
      hub.handlers.get(event)!.add(fn);
      return () => { hub.handlers.get(event)?.delete(fn); };
    },
  },
}));
const fg = vi.hoisted(() => ({ handlers: new Set<() => void>() }));
vi.mock('@/services/telegram', () => ({
  onAppForeground: (fn: () => void) => { fg.handlers.add(fn); return () => { fg.handlers.delete(fn); }; },
}));
vi.mock('@/services/authStore', () => ({ authStore: { getUser: () => ({ id: '9' }) } }));
const outbox = vi.hoisted(() => ({ queue: [] as Array<{ kind: string; tripId: string }> }));
vi.mock('@/services/tripOutbox', () => ({ tripOutbox: { pending: () => outbox.queue } }));
const api = vi.hoisted(() => ({ mine: vi.fn() }));
vi.mock('@/api/tripApi', () => ({ tripApi: api }));

// The server sends TripResponseDto with numeric ids.
const started = (id: number, over: Partial<TripDto> = {}): TripDto => ({
  id, driverId: 9, status: 'InProgress', category: 'Planned', role: 'Driver', isVisible: false,
  departureTimeUtc: '2026-11-25T08:00:00Z',
  origin: { address: 'Chilonzor' }, destination: { address: 'Yunusobod' }, ...over,
});
const idsOf = (calls: unknown[][]) => calls.map(([trip]) => (trip as TripDto).id);
const flushAll = () => new Promise((resolve) => { setTimeout(resolve, 0); });
/** Lets pending promise callbacks run (also under fake timers). */
const ticks = async (n = 10) => { for (let i = 0; i < n; i += 1) await Promise.resolve(); };

/** The flow over a fake app whose state the test changes. */
function setup(over: Partial<AppNow> = {}, ready = true) {
  const app = { ready, now: { activeTripId: null, busy: false, mode: 'driver', agreement: false, ...over } as AppNow };
  const resume = vi.fn();
  const notify = vi.fn();
  const flow = createStartedTrips({ ready: () => app.ready, now: () => app.now, resume, notify });
  return { app, flow, resume, notify };
}

beforeEach(() => {
  i18nStore.set('en');
  hub.handlers.clear();
  fg.handlers.clear();
  outbox.queue = [];
  api.mine.mockReset().mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('a start of mine', () => {
  it('goes on the map at once when nothing is in its way — and is told once', () => {
    const { flow, resume, notify } = setup();

    flow.heard(started(501));
    flow.heard(started(501)); // the same start again (a second device, a replay)

    expect(idsOf(resume.mock.calls)).toEqual([501]);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({ title: t('push.tripStartedTitle'), body: 'Chilonzor → Yunusobod', priority: 'high' });
  });

  it('is ignored when it is the journey on the map already', () => {
    const { flow, resume, notify } = setup({ activeTripId: '501' });

    flow.heard(started(501));

    expect(resume).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('is left out while this device is closing it', () => {
    const { flow, resume, notify } = setup();
    outbox.queue = [{ kind: 'cancel', tripId: '501' }];

    flow.heard(started(501));

    expect(resume).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('says what keeps it off the map, in words that match', () => {
    const route = 'Chilonzor → Yunusobod';
    expect(startedToast(started(1), 'journey').body).toBe(t('push.tripStartedAfterRoute', { route }));
    expect(startedToast(started(1), 'busy').body).toBe(t('push.tripStartedSoon', { route }));
    expect(startedToast(started(1), 'agreement').body).toBe(t('push.tripStartedAfterAgreement', { route }));
    expect(startedToast(started(1), null).body).toBe(route);
  });
});

describe('a start that waits for its turn', () => {
  it('another journey on the map: told, kept — and on the map once that journey ends', async () => {
    const { app, flow, resume, notify } = setup({ activeTripId: '12' });

    flow.heard(started(501));
    expect(resume).not.toHaveBeenCalled();
    expect(notify.mock.calls[0][0].body).toBe(t('push.tripStartedAfterRoute', { route: 'Chilonzor → Yunusobod' }));
    expect(flow.waiting()?.id).toBe(501);

    await flow.recheck(); // still in the way: not even looked up
    expect(api.mine).not.toHaveBeenCalled();

    app.now = { ...app.now, activeTripId: null };
    api.mine.mockResolvedValue([started(501, { departureTimeUtc: '2026-11-25T08:05:00Z' })]);
    await flow.recheck();

    expect(idsOf(resume.mock.calls)).toEqual([501]);
    expect(resume.mock.calls[0][0].departureTimeUtc).toBe('2026-11-25T08:05:00Z'); // the fresh copy
    expect(flow.waiting()).toBeNull();
    expect(notify).toHaveBeenCalledTimes(1); // told once: going on the map later says nothing more
  });

  it('the user busy (a route being set up, a call): told so, and on the map when done', async () => {
    const { app, flow, resume, notify } = setup({ busy: true });

    flow.heard(started(501));
    expect(notify.mock.calls[0][0].body).toBe(t('push.tripStartedSoon', { route: 'Chilonzor → Yunusobod' }));

    app.now = { ...app.now, busy: false };
    api.mine.mockResolvedValue([started(501)]);
    await flow.recheck();
    expect(idsOf(resume.mock.calls)).toEqual([501]);
  });

  it('an agreement of the other role: told so; once it is over the role switches for the journey', async () => {
    const { app, flow, resume, notify } = setup({ mode: 'passenger', agreement: true });

    flow.heard(started(501));
    expect(notify.mock.calls[0][0].body).toBe(t('push.tripStartedAfterAgreement', { route: 'Chilonzor → Yunusobod' }));
    await flow.recheck();
    expect(resume).not.toHaveBeenCalled();

    app.now = { ...app.now, agreement: false };
    api.mine.mockResolvedValue([started(501)]);
    await flow.recheck();
    expect(idsOf(resume.mock.calls)).toEqual([501]);
  });

  it('closed meanwhile (another device, the server): dropped, never put on the map', async () => {
    const { app, flow, resume } = setup({ activeTripId: '12' });
    flow.heard(started(501));

    app.now = { ...app.now, activeTripId: null };
    api.mine.mockResolvedValue([]);
    await flow.recheck();

    expect(resume).not.toHaveBeenCalled();
    expect(flow.waiting()).toBeNull();
  });

  it('offline at its turn: on the map as it was told — unless this device is closing it', async () => {
    const first = setup({ activeTripId: '12' });
    first.flow.heard(started(501));
    first.app.now = { ...first.app.now, activeTripId: null };
    api.mine.mockRejectedValue(new Error('Failed to fetch'));
    await first.flow.recheck();
    expect(idsOf(first.resume.mock.calls)).toEqual([501]);

    const second = setup({ activeTripId: '12' });
    second.flow.heard(started(502));
    second.app.now = { ...second.app.now, activeTripId: null };
    outbox.queue = [{ kind: 'cancel', tripId: '502' }];
    await second.flow.recheck();
    expect(second.resume).not.toHaveBeenCalled();
    expect(second.flow.waiting()).toBeNull();
  });

  it('something got in the way while it was looked up: it keeps waiting for the next turn', async () => {
    const { app, flow, resume } = setup({ activeTripId: '12' });
    flow.heard(started(501));
    app.now = { ...app.now, activeTripId: null };
    let answer: (rows: TripDto[]) => void = () => {};
    api.mine.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));

    const turn = flow.recheck();
    app.now = { ...app.now, busy: true }; // the route sheet opened meanwhile
    answer([started(501)]);
    await turn;
    expect(resume).not.toHaveBeenCalled();
    expect(flow.waiting()?.id).toBe(501);

    app.now = { ...app.now, busy: false };
    api.mine.mockResolvedValue([started(501)]);
    await flow.recheck();
    expect(idsOf(resume.mock.calls)).toEqual([501]);
  });

  it('after the user switches to another role it waits for its own — the role they picked is not taken away', async () => {
    const { app, flow, resume } = setup({ activeTripId: '12' });
    flow.heard(started(501)); // a driver's journey, told while another one is on the map

    flow.roleChosen('passenger'); // switching role ends the journey on the map
    app.now = { ...app.now, activeTripId: null, mode: 'passenger' };
    await flow.recheck();
    expect(resume).not.toHaveBeenCalled();
    expect(api.mine).not.toHaveBeenCalled();

    flow.roleChosen('driver');
    app.now = { ...app.now, mode: 'driver' };
    api.mine.mockResolvedValue([started(501)]);
    await flow.recheck();
    expect(idsOf(resume.mock.calls)).toEqual([501]);
  });

  it('a switch to its own role puts it on the map', async () => {
    const { app, flow, resume } = setup({ activeTripId: '12', mode: 'passenger' });
    flow.heard(started(501));

    flow.roleChosen('driver');
    app.now = { ...app.now, activeTripId: null, mode: 'driver' };
    api.mine.mockResolvedValue([started(501)]);
    await flow.recheck();
    expect(idsOf(resume.mock.calls)).toEqual([501]);
  });

  it('dropped (a new route replaces it): it never comes back, not even from a fresh read', async () => {
    const { app, flow, resume, notify } = setup({ busy: true });
    flow.heard(started(501));

    flow.drop();
    app.now = { ...app.now, busy: false };
    api.mine.mockResolvedValue([started(501)]);
    await flow.recheck();
    await flow.catchUp('reconnect');

    expect(resume).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(flow.waiting()).toBeNull();
  });

  it('a newer start takes the place of an older one', () => {
    const { flow } = setup({ activeTripId: '12' });

    flow.heard(started(501));
    flow.heard(started(502));

    expect(flow.waiting()?.id).toBe(502);
  });
});

describe('a start missed while away', () => {
  it('is found when my trips are read again — and told once, not on every reconnect', async () => {
    const { flow, notify } = setup({ activeTripId: '12' });
    api.mine.mockResolvedValue([started(12, { category: 'Live' }), started(501)]);

    await flow.catchUp('reconnect');
    await flow.catchUp('reconnect');
    await flow.catchUp('online');

    expect(api.mine).toHaveBeenCalledTimes(3);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(flow.waiting()?.id).toBe(501); // the journey on the map is not handed over
  });

  it('goes on the map when nothing is in the way', async () => {
    const { flow, resume } = setup();
    api.mine.mockResolvedValue([started(501)]);

    await flow.catchUp('reconnect');

    expect(idsOf(resume.mock.calls)).toEqual([501]);
  });

  it('is not looked for before the launch has settled, nor when the read fails', async () => {
    const { app, flow, resume, notify } = setup({}, false);
    api.mine.mockResolvedValue([started(501)]);
    await flow.catchUp('reconnect');
    expect(api.mine).not.toHaveBeenCalled();

    app.ready = true;
    api.mine.mockRejectedValue(new Error('offline'));
    await flow.catchUp('reconnect');
    expect(resume).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('back in view, my trips are read again at most every so often', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-25T08:00:00Z'));
    const { flow } = setup();

    await flow.catchUp('foreground');
    await flow.catchUp('foreground');
    expect(api.mine).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + FOREGROUND_CATCH_UP_MS + 1);
    await flow.catchUp('foreground');
    expect(api.mine).toHaveBeenCalledTimes(2);
  });

  it('a second ask while a read is on its way reads once more afterwards', async () => {
    const { flow, resume } = setup();
    let answer: (rows: TripDto[]) => void = () => {};
    api.mine.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));

    const first = flow.catchUp('reconnect');
    api.mine.mockResolvedValue([started(501)]);
    void flow.catchUp('online'); // the started trip is only in the second answer
    answer([]);
    await first;

    expect(api.mine).toHaveBeenCalledTimes(2);
    expect(idsOf(resume.mock.calls)).toEqual([501]);
  });
});

describe('the launch', () => {
  it('what it resumed or told is not told again', async () => {
    const { flow, resume, notify } = setup({ activeTripId: '3' });

    flow.launched({ resume: started(3), announce: true, tell: started(4), tellHold: 'journey', catchUp: false });
    expect(notify.mock.calls.map(([n]) => n.body)).toEqual([
      'Chilonzor → Yunusobod', t('push.tripStartedAfterRoute', { route: 'Chilonzor → Yunusobod' }),
    ]);
    expect(flow.waiting()?.id).toBe(4);

    flow.heard(started(3));
    flow.heard(started(4));
    api.mine.mockResolvedValue([started(3), started(4)]);
    await flow.catchUp('reconnect');

    expect(notify).toHaveBeenCalledTimes(2);
    expect(resume).not.toHaveBeenCalled();
  });

  it('one that could not read my trips looks again after a short delay — and once back in view', async () => {
    vi.useFakeTimers();
    const { flow, resume } = setup();
    api.mine.mockResolvedValue([started(501)]);

    flow.launched({ resume: null, announce: false, tell: null, tellHold: null, catchUp: true });
    await vi.advanceTimersByTimeAsync(LAUNCH_CATCH_UP_MS - 1);
    expect(api.mine).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await ticks();

    expect(idsOf(resume.mock.calls)).toEqual([501]);

    // The launch's look is not repeated by the timer, and a quick foreground is throttled now.
    await flow.catchUp('foreground');
    expect(api.mine).toHaveBeenCalledTimes(1);
  });

  it('a launch that read my trips does not read them again on the first return to view', async () => {
    const { flow } = setup();

    flow.launched({ resume: null, announce: false, tell: null, tellHold: null, catchUp: false });
    await flow.catchUp('foreground');

    expect(api.mine).not.toHaveBeenCalled();
  });

  it('while the launch could not read my trips, a return to view is not throttled', async () => {
    vi.useFakeTimers();
    const { flow } = setup();
    api.mine.mockRejectedValue(new Error('offline'));

    flow.launched({ resume: null, announce: false, tell: null, tellHold: null, catchUp: true });
    await flow.catchUp('foreground');
    await flow.catchUp('foreground');

    expect(api.mine).toHaveBeenCalledTimes(2);
    flow.dispose();
  });

  it('a start heard during the splash is handed over once the launch has settled — once', () => {
    const { app, flow, resume } = setup({}, false);

    flow.heard(started(501));
    expect(resume).not.toHaveBeenCalled();

    app.ready = true;
    flow.settled();
    flow.settled();
    flow.heard(started(501));

    expect(idsOf(resume.mock.calls)).toEqual([501]);
  });
});

describe('useTripStarted', () => {
  const fire = (event: string, payload?: unknown) => act(() => { hub.handlers.get(event)?.forEach((fn) => fn(payload)); });
  const startedEvt = (over: Partial<TripDto> = {}, type = 'started') => ({ type, actorUserId: 9, trip: started(501, over) });

  function mount(props: { authReady?: boolean; ready?: boolean; now?: Partial<AppNow>; blockers?: string } = {}) {
    const resume = vi.fn();
    const notify = vi.fn();
    const base = (p: typeof props) => ({
      authReady: p.authReady ?? true,
      ready: p.ready ?? true,
      now: () => ({ activeTripId: null, busy: false, mode: 'driver', agreement: false, ...p.now }) as AppNow,
      blockers: p.blockers ?? '',
      resume, notify,
    });
    const view = renderHook((p: typeof props) => useTripStarted(base(p)), { initialProps: props });
    return { resume, notify, view };
  }

  it('hands over my trip the server has just started — not other events, nor someone else’s trip', async () => {
    const { resume } = mount();

    await fire('TripEvent', startedEvt({}, 'completed'));
    await fire('TripEvent', startedEvt({ driverId: 7 }));
    await fire('TripEvent', startedEvt());

    expect(idsOf(resume.mock.calls)).toEqual([501]);
  });

  it('keeps a start heard during the splash until the launch has settled — and hands it over once', async () => {
    const { resume, view } = mount({ ready: false });

    await fire('TripEvent', startedEvt());
    expect(resume).not.toHaveBeenCalled();

    view.rerender({ ready: true });
    view.rerender({ ready: false });
    view.rerender({ ready: true });
    await fire('TripEvent', startedEvt());

    expect(idsOf(resume.mock.calls)).toEqual([501]);
  });

  it('reads my trips again when the app is in view, the hub is back and the device online', async () => {
    mount();
    const inView = () => act(async () => { fg.handlers.forEach((fn) => fn()); await flushAll(); });

    await inView();
    expect(api.mine).toHaveBeenCalledTimes(1);

    await fire('Reconnected');
    await act(async () => { await flushAll(); });
    await act(async () => { window.dispatchEvent(new Event('online')); await flushAll(); });
    expect(api.mine).toHaveBeenCalledTimes(3);

    await inView(); // read just now: throttled
    expect(api.mine).toHaveBeenCalledTimes(3);
  });

  it('a waiting journey goes on the map once the blockers change and nothing is in its way', async () => {
    const { resume, view } = mount({ now: { busy: true }, blockers: 'sheet' });
    await fire('TripEvent', startedEvt());
    expect(resume).not.toHaveBeenCalled();

    api.mine.mockResolvedValue([started(501)]);
    view.rerender({ now: { busy: false }, blockers: '' });
    await act(async () => { await flushAll(); });

    expect(idsOf(resume.mock.calls)).toEqual([501]);
  });

  it('an agreement that ends lets a journey of the other role go on the map', async () => {
    let agreement = true;
    const resume = vi.fn();
    renderHook(() => useTripStarted({
      authReady: true, ready: true, blockers: '', notify: vi.fn(), resume,
      now: () => ({ activeTripId: null, busy: false, mode: 'passenger', agreement }),
    }));
    await fire('TripEvent', startedEvt());
    expect(resume).not.toHaveBeenCalled();

    agreement = false;
    api.mine.mockResolvedValue([started(501)]);
    await act(async () => { window.dispatchEvent(new Event(AGREEMENT_EVENT)); await flushAll(); });

    expect(idsOf(resume.mock.calls)).toEqual([501]);
  });

  it('listens only once signed in, and stops when unmounted', () => {
    const { view } = mount({ authReady: false });
    expect(hub.handlers.get('TripEvent')?.size ?? 0).toBe(0);
    expect(hub.handlers.get('Reconnected')?.size ?? 0).toBe(0);

    view.rerender({ authReady: true });
    expect(hub.handlers.get('TripEvent')?.size).toBe(1);
    expect(hub.handlers.get('Reconnected')?.size).toBe(1);
    expect(fg.handlers.size).toBe(1);

    view.unmount();
    expect(hub.handlers.get('TripEvent')?.size).toBe(0);
    expect(hub.handlers.get('Reconnected')?.size).toBe(0);
    expect(fg.handlers.size).toBe(0);
  });
});
