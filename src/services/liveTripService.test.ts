import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ConfirmRequest } from './confirm';
import type { TripDto } from './tripResume';

const presence = vi.hoisted(() => ({ markEngaged: vi.fn(), markAvailable: vi.fn() }));
vi.mock('@/services/realtime', () => ({
  presenceClient: {
    on: () => () => {}, onResync: () => () => {}, connection: () => null, clearRoute: () => Promise.resolve(),
    syncWalkerState: () => Promise.resolve(null),
    markEngaged: () => { presence.markEngaged(); return Promise.resolve(); },
    markAvailable: () => { presence.markAvailable(); return Promise.resolve(); },
  },
}));
vi.mock('@/api/blocksApi', () => ({ blocksApi: { list: async () => [], block: async () => ({}), unblock: async () => {} } }));
const outbox = vi.hoisted(() => ({ enqueue: vi.fn() }));
vi.mock('@/services/tripOutbox', () => ({ tripOutbox: { enqueue: outbox.enqueue, pending: () => [], flush: () => Promise.resolve() } }));

const KEY = 'ontheway_ride_companions_v1';

async function load() {
  vi.resetModules();
  return import('./liveTripService');
}

beforeEach(() => {
  localStorage.clear();
  outbox.enqueue.mockReset();
  presence.markEngaged.mockReset();
  presence.markAvailable.mockReset();
});
afterEach(() => { vi.useRealTimers(); });

describe('"band"', () => {
  it('on: hides the trip given and leaves discovery', async () => {
    const { publishBanded } = await load();

    publishBanded(true, '12');

    expect(presence.markEngaged).toHaveBeenCalledTimes(1);
    expect(outbox.enqueue.mock.calls).toEqual([[{ kind: 'hide', tripId: '12' }]]);
  });

  it('off: shows every trip given again — once each — and returns to discovery', async () => {
    const { publishBanded } = await load();

    publishBanded(false, ['12', null, '5', '12']);

    expect(presence.markAvailable).toHaveBeenCalledTimes(1);
    expect(outbox.enqueue.mock.calls).toEqual([[{ kind: 'show', tripId: '12' }], [{ kind: 'show', tripId: '5' }]]);
  });

  it('without a trip only the session flag and the presence change', async () => {
    const { publishBanded } = await load();
    const { walkerStateStore } = await import('@/services/walkerStateStore');

    publishBanded(true, null);

    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(walkerStateStore.get().engaged).toBe(true);
  });
});

describe('ride companions', () => {
  it('are kept with the time of the agreement, once each', async () => {
    const { recordCompanion, recordedCompanions, forgetCompanion } = await load();
    recordCompanion('7');
    recordCompanion('8');
    recordCompanion('7');

    expect(recordedCompanions().sort()).toEqual(['7', '8']);
    forgetCompanion('7');
    expect(recordedCompanions()).toEqual(['8']);
  });

  it('a companion agreed more than a day ago never lands on a later trip', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-10T08:00:00Z'));
    const { recordCompanion, recordedCompanions, COMPANION_LIFETIME_MS } = await load();
    recordCompanion('7');

    vi.setSystemTime(new Date(Date.parse('2026-11-10T08:00:00Z') + COMPANION_LIFETIME_MS - 1));
    expect(recordedCompanions()).toEqual(['7']);
    vi.setSystemTime(new Date(Date.parse('2026-11-10T08:00:00Z') + COMPANION_LIFETIME_MS + 1));
    expect(recordedCompanions()).toEqual([]);
  });

  it('the older bare-id list is stamped once and then expires like the rest', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-10T08:00:00Z'));
    localStorage.setItem(KEY, JSON.stringify(['7']));
    const { recordedCompanions, COMPANION_LIFETIME_MS } = await load();

    expect(recordedCompanions()).toEqual(['7']);
    expect(JSON.parse(localStorage.getItem(KEY) || '[]')).toEqual([{ peerId: '7', at: Date.parse('2026-11-10T08:00:00Z') }]);
    vi.setSystemTime(new Date(Date.parse('2026-11-10T08:00:00Z') + COMPANION_LIFETIME_MS + 1));
    expect(recordedCompanions()).toEqual([]);
  });
});

describe('going live asks first about what it replaces', () => {
  const NOW = Date.parse('2026-11-25T08:00:00Z');
  const plan = (id: number, over: Partial<TripDto> = {}): TripDto => ({
    id, driverId: 9, status: 'Scheduled', category: 'Planned', role: 'Driver', isVisible: true,
    departureTimeUtc: '2026-11-25T08:40:00Z',
    origin: { address: 'Chilonzor' }, destination: { address: 'Yunusobod' },
    ...over,
  });
  const journey = plan(3, { status: 'InProgress', isVisible: false, origin: { address: 'Sergeli' }, destination: { address: 'Olmazor' } });
  /** HH:MM on this device's clock: the departure is named in local time. */
  const localTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  /** An answer to every question, and the questions asked. */
  const answering = (ok: boolean) => {
    const asked: ConfirmRequest[] = [];
    return { asked, ask: async (question: ConfirmRequest) => { asked.push(question); return ok; } };
  };

  async function loadInEnglish() {
    const mod = await load();
    (await import('@/i18n')).i18nStore.set('en');
    return mod;
  }

  it('a plan of mine departing around now: named by its route and local departure time', async () => {
    const { confirmGoingLive } = await loadInEnglish();
    const user = answering(true);

    await expect(confirmGoingLive({ waiting: null, trips: [journey, plan(5)], now: NOW }, user.ask)).resolves.toBe(true);

    expect(user.asked).toEqual([{
      title: 'Start a new route?',
      body: `This live route replaces your planned trip “Chilonzor → Yunusobod” at ${localTime('2026-11-25T08:40:00Z')}.`,
      confirmLabel: 'Start the new route', cancelLabel: 'Keep my trip', danger: true,
    }]);
  });

  it('a plan of the other role counts too', async () => {
    const { confirmGoingLive } = await loadInEnglish();
    const user = answering(true);

    await confirmGoingLive({ waiting: null, trips: [plan(5, { role: 'Passenger' })], now: NOW }, user.ask);

    expect(user.asked).toHaveLength(1);
  });

  it('Cancel: it resolves false, so nothing starts — asked in the app’s own dialog', async () => {
    const { confirmGoingLive } = await loadInEnglish();
    const { confirmStore } = await import('./confirm');

    const answer = confirmGoingLive({ waiting: null, trips: [plan(5)], now: NOW });
    expect(confirmStore.get()?.body).toContain('“Chilonzor → Yunusobod”');
    confirmStore.settle(false);

    await expect(answer).resolves.toBe(false);
  });

  it('a journey also waits for its turn: asked once, in one dialog that says both', async () => {
    const { confirmGoingLive } = await loadInEnglish();
    const user = answering(false);

    await expect(confirmGoingLive({ waiting: journey, trips: [journey, plan(5)], now: NOW }, user.ask)).resolves.toBe(false);

    expect(user.asked).toHaveLength(1);
    expect(user.asked[0].body).toBe('Your trip Sergeli → Olmazor has started. A new route calls it off and replaces '
      + `your planned trip “Chilonzor → Yunusobod” at ${localTime('2026-11-25T08:40:00Z')}.`);
  });

  it('only a journey waits: the question it was always asked about', async () => {
    const { confirmGoingLive } = await loadInEnglish();
    const user = answering(true);

    await confirmGoingLive({ waiting: journey, trips: null, now: NOW }, user.ask);

    expect(user.asked.map((q) => q.body)).toEqual(['Your trip Sergeli → Olmazor has started. A new route calls it off.']);
  });

  it('several plans around now: the soonest is named, the others counted', async () => {
    const { confirmGoingLive } = await loadInEnglish();
    const user = answering(true);
    const trips = [plan(5), plan(6, { departureTimeUtc: '2026-11-25T08:50:00Z' }),
      plan(7, { departureTimeUtc: '2026-11-25T07:30:00Z', origin: { address: 'Sergeli' } })];

    await confirmGoingLive({ waiting: null, trips, now: NOW }, user.ask);

    expect(user.asked[0].body).toBe(`This live route replaces your planned trip “Sergeli → Yunusobod” at ${localTime('2026-11-25T07:30:00Z')}.`
      + ' 2 more planned trips around this time are cancelled too.');
  });

  it('nothing replaced — plans further away, or my trips unknown: it starts without asking', async () => {
    const { confirmGoingLive } = await loadInEnglish();
    const user = answering(false);
    const later = plan(5, { departureTimeUtc: '2026-11-25T09:00:01Z' }); // just outside the hour

    await expect(confirmGoingLive({ waiting: null, trips: [later, journey], now: NOW }, user.ask)).resolves.toBe(true);
    await expect(confirmGoingLive({ waiting: null, trips: null, now: NOW }, user.ask)).resolves.toBe(true);
    expect(user.asked).toEqual([]);
  });

  it('a plan the server started meanwhile is named once — as the journey it is now, not also as a plan', async () => {
    const { confirmGoingLive } = await loadInEnglish();
    const user = answering(true);
    const at8 = { departureTimeUtc: '2026-11-25T08:00:00Z' };
    const started = plan(5, { ...at8, status: 'InProgress', isVisible: false });
    // My trips as read before it started: it is still a plan there.
    const before = [plan(5, at8)];
    const another = plan(6, { origin: { address: 'Sergeli' } });

    await confirmGoingLive({ waiting: started, trips: before, now: NOW + 20_000 }, user.ask);
    await confirmGoingLive({ waiting: started, trips: [...before, another], now: NOW + 20_000 }, user.ask);

    expect(user.asked.map((q) => q.body)).toEqual([
      'Your trip Chilonzor → Yunusobod has started. A new route calls it off.',
      'Your trip Chilonzor → Yunusobod has started. A new route calls it off and replaces '
        + `your planned trip “Sergeli → Yunusobod” at ${localTime('2026-11-25T08:40:00Z')}.`,
    ]);
  });
});

describe('"Start" in the route sheet', () => {
  const NOW = Date.parse('2026-11-25T08:00:20Z');
  const plan = (id: number, over: Partial<TripDto> = {}): TripDto => ({
    id, driverId: 9, status: 'Scheduled', category: 'Planned', role: 'Driver', isVisible: true,
    departureTimeUtc: '2026-11-25T08:00:00Z',
    origin: { address: 'Chilonzor' }, destination: { address: 'Yunusobod' },
    ...over,
  });
  const deferred = <T = void>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
  };
  const flush = () => new Promise<void>((done) => { setTimeout(done, 0); });

  /** The sheet's start flow over a fake app: my trips as last read, the journey
      waiting, the map's role — and the user's answer to every question. */
  async function sheet() {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const { createRouteStarts } = await load();
    (await import('@/i18n')).i18nStore.set('en');
    const app = {
      trips: [] as TripDto[] | null,
      waiting: null as TripDto | null,
      role: 'driver' as 'driver' | 'passenger' | null,
      answer: (_q: ConfirmRequest): Promise<boolean> => Promise.resolve(true),
    };
    const asked: ConfirmRequest[] = [];
    const starts = createRouteStarts({
      trips: () => app.trips, waiting: () => app.waiting, role: () => app.role,
      ask: (question) => { asked.push(question); return app.answer(question); },
    });
    return { app, asked, starts };
  }

  it('waits for the read the sheet started, then asks from my trips as listed by then', async () => {
    const { app, asked, starts } = await sheet();
    const read = deferred();
    starts.opened(read.promise);

    const outcome = starts.start(true);
    await flush();
    expect(asked).toEqual([]); // still waiting for the read
    app.trips = [plan(5)];     // the read lists a plan departing now
    read.resolve();

    await expect(outcome).resolves.toEqual({ kind: 'go', role: 'driver', replaces: null });
    expect(asked).toHaveLength(1);
    expect(asked[0].body).toContain('“Chilonzor → Yunusobod”');
  });

  it('the question after a plan started meanwhile names it only as the journey it is now', async () => {
    const { app, asked, starts } = await sheet();
    const read = deferred();
    starts.opened(read.promise);
    app.trips = [plan(5)];     // read when the sheet opened: a plan
    const started = plan(5, { status: 'InProgress', isVisible: false });
    app.waiting = started;     // then the server started it, and it waits for its turn

    const outcome = starts.start(true);
    read.resolve();

    await expect(outcome).resolves.toEqual({ kind: 'go', role: 'driver', replaces: started });
    expect(asked.map((q) => q.body)).toEqual(['Your trip Chilonzor → Yunusobod has started. A new route calls it off.']);
  });

  it('Back during the wait starts nothing — and a start tapped after it is not held up', async () => {
    const { app, asked, starts } = await sheet();
    app.trips = [plan(5)];
    const read = deferred();
    starts.opened(read.promise);

    const first = starts.start(true);
    starts.routesChanged(); // Back to the address form
    const second = starts.start(true); // the route shown again, "Start" again
    read.resolve();

    await expect(first).resolves.toEqual({ kind: 'void' });
    await expect(second).resolves.toMatchObject({ kind: 'go' });
    expect(asked).toHaveLength(1); // asked for the second only
  });

  it('another route picked during the wait: the one tapped does not start', async () => {
    const { starts } = await sheet();
    const read = deferred();
    starts.opened(read.promise);

    const outcome = starts.start(true);
    starts.routesChanged();
    read.resolve();

    await expect(outcome).resolves.toEqual({ kind: 'void' });
  });

  it('the sheet closed, or the map left, during the wait: nothing starts, nothing is asked', async () => {
    const { app, asked, starts } = await sheet();
    app.trips = [plan(5)];
    const read = deferred();
    starts.opened(read.promise);

    const outcome = starts.start(true);
    starts.closed();
    read.resolve();

    await expect(outcome).resolves.toEqual({ kind: 'void' });
    expect(asked).toEqual([]);
  });

  it('a role switch during the wait starts nothing — never in the role it was not tapped in', async () => {
    const { app, asked, starts } = await sheet();
    app.trips = [plan(5)];
    const read = deferred();
    starts.opened(read.promise);

    const switched = starts.start(true);
    starts.closed();        // switchRole: leaving the map closes the sheet…
    app.role = 'passenger'; // …and the map comes back in the other role
    read.resolve();
    await expect(switched).resolves.toEqual({ kind: 'void' });

    // The role moved on while the sheet stayed open: nothing starts either.
    const again = deferred();
    starts.opened(again.promise);
    const moved = starts.start(true); // tapped as a passenger
    app.role = 'driver';
    again.resolve();
    await expect(moved).resolves.toEqual({ kind: 'void' });
    expect(asked).toEqual([]);
  });

  it('a new start in a newly opened sheet is not swallowed by an abandoned older one', async () => {
    const { app, asked, starts } = await sheet();
    app.trips = [plan(5)];
    const older = deferred();
    const newer = deferred();
    starts.opened(older.promise);
    const abandoned = starts.start(true);
    starts.closed();

    starts.opened(newer.promise);
    const fresh = starts.start(true);
    newer.resolve();

    await expect(fresh).resolves.toEqual({ kind: 'go', role: 'driver', replaces: null });
    older.resolve();
    await expect(abandoned).resolves.toEqual({ kind: 'void' });
    expect(asked).toHaveLength(1);
  });

  it('one at a time: a second tap while one waits or asks starts nothing; once one went, its sheet starts no more', async () => {
    const { app, starts } = await sheet();
    app.trips = [plan(5)];
    const answer = deferred<boolean>();
    app.answer = () => answer.promise;
    starts.opened(Promise.resolve());

    const first = starts.start(true);
    await expect(starts.start(true)).resolves.toEqual({ kind: 'void' }); // while it waits
    await flush();
    await expect(starts.start(true)).resolves.toEqual({ kind: 'void' }); // while it asks
    answer.resolve(true);
    await expect(first).resolves.toMatchObject({ kind: 'go' });
    await expect(starts.start(true)).resolves.toEqual({ kind: 'void' }); // the sheet may not be gone yet

    app.answer = () => Promise.resolve(true);
    starts.opened(null); // the sheet opened again
    await expect(starts.start(true)).resolves.toMatchObject({ kind: 'go' });
  });

  it('Cancel keeps my trips: nothing starts, the sheet can start again; a kept journey says so', async () => {
    const { app, asked, starts } = await sheet();
    app.trips = [plan(5)];
    app.answer = () => Promise.resolve(false);
    starts.opened(Promise.resolve());

    await expect(starts.start(true)).resolves.toEqual({ kind: 'kept', journey: false });
    app.waiting = plan(7, { status: 'InProgress', isVisible: false });
    await expect(starts.start(true)).resolves.toEqual({ kind: 'kept', journey: true });
    expect(asked).toHaveLength(2);
  });

  it('a plan that starts while asked about: kept, it goes on the map; else the new route calls it off too', async () => {
    const { app, asked, starts } = await sheet();
    app.trips = [plan(5)];
    starts.opened(Promise.resolve());
    const started = plan(5, { status: 'InProgress', isVisible: false });
    // The server starts the plan while the question is on screen.
    app.answer = () => { app.waiting = started; return Promise.resolve(false); };

    await expect(starts.start(true)).resolves.toEqual({ kind: 'kept', journey: true });
    expect(asked[0].body).toContain('your planned trip “Chilonzor → Yunusobod”'); // asked about it as the plan it was

    app.waiting = null;
    app.answer = () => { app.waiting = started; return Promise.resolve(true); };
    await expect(starts.start(true)).resolves.toEqual({ kind: 'go', role: 'driver', replaces: started });
  });

  it('walked away while asked: nothing starts, even if the answer is yes', async () => {
    const { app, asked, starts } = await sheet();
    app.trips = [plan(5)];
    const answer = deferred<boolean>();
    app.answer = () => answer.promise;
    starts.opened(Promise.resolve());

    const outcome = starts.start(true);
    await flush();
    expect(asked).toHaveLength(1);
    starts.closed();
    answer.resolve(true);

    await expect(outcome).resolves.toEqual({ kind: 'void' });
  });

  it('no read to wait for (mock mode), or no road route: it goes at once', async () => {
    const { app, asked, starts } = await sheet();
    starts.opened(null);
    await expect(starts.start(true)).resolves.toEqual({ kind: 'go', role: 'driver', replaces: null });

    app.trips = [plan(5)];
    starts.opened(deferred().promise); // a read that never comes
    await expect(starts.start(false)).resolves.toEqual({ kind: 'go', role: 'driver', replaces: null });
    expect(asked).toEqual([]);
  });
});
