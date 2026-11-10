import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A fake presence hub: the service subscribes to its events, registers a resync
// step and invokes commands on the live connection.
const hub = vi.hoisted(() => {
  const handlers = new Map<string, (payload: unknown) => void>();
  const steps: Array<(conn: unknown) => Promise<void>> = [];
  const conn = { state: 'Connected', invoke: vi.fn() };
  return { handlers, steps, conn, online: true };
});
vi.mock('@/services/realtime', () => ({
  presenceClient: {
    on: (event: string, fn: (payload: unknown) => void) => { hub.handlers.set(event, fn); return () => {}; },
    onResync: (step: (conn: unknown) => Promise<void>) => { hub.steps.push(step); return () => {}; },
    connection: () => (hub.online ? hub.conn : null),
  },
}));
const geo = vi.hoisted(() => ({ getCurrentLatLng: vi.fn() }));
vi.mock('@/services/geolocation', () => geo);

const armed = { userId: '1', role: 'passenger', lat: 41.3, lng: 69.2, expiresAtUtc: new Date(Date.now() + 3_600_000).toISOString() };
const KEY = 'ontheway_walker_alert_v1';
const HERE: [number, number] = [41.3, 69.2];

let serverAlert: typeof armed | null = null;

/** Fresh module (the cached state and unsent wish are read from storage on import). */
async function load() {
  vi.resetModules();
  hub.handlers.clear();
  hub.steps.length = 0;
  const { walkerAlertService } = await import('./walkerAlertService');
  const fired = vi.fn();
  walkerAlertService.onFired(fired);
  return { service: walkerAlertService, fired };
}

const push = (event: string, payload: unknown = null) => hub.handlers.get(event)!(payload);
const reconnect = async () => { for (const step of hub.steps) await step(hub.conn); };
const settle = () => new Promise((r) => setTimeout(r, 0));
const calls = (method: string) => hub.conn.invoke.mock.calls.filter((c) => c[0] === method);

beforeEach(() => {
  localStorage.clear();
  hub.online = true;
  hub.conn.state = 'Connected';
  serverAlert = null;
  geo.getCurrentLatLng.mockReset().mockResolvedValue(null);
  hub.conn.invoke.mockReset().mockImplementation((method: string) => {
    if (method === 'GetWalkerAlert') return Promise.resolve(serverAlert);
    if (method === 'SetWalkerAlert') { serverAlert = armed; return Promise.resolve(armed); }
    if (method === 'ClearWalkerAlert') serverAlert = null;
    return Promise.resolve(undefined);
  });
});

afterEach(() => { vi.doUnmock('@/api/client'); });

describe('walker alert', () => {
  it('turns on at once and tells the server the role and position', async () => {
    const { service } = await load();

    await expect(service.enable('passenger', HERE)).resolves.toBe(true);
    expect(service.isOn()).toBe(true);
    await settle();

    expect(calls('SetWalkerAlert')).toEqual([['SetWalkerAlert', 'passenger', 41.3, 69.2]]);
    expect(service.isOn()).toBe(true);
    expect(service.pending()).toBeNull();
  });

  it('after a reopen the "on" state comes from the server', async () => {
    let { service } = await load();
    expect(service.isOn()).toBe(false);

    serverAlert = armed; // armed earlier, on another launch
    await reconnect();
    expect(service.isOn()).toBe(true);

    // It fired (or expired) while the app was closed: quietly off, no toast —
    // the Telegram message already told them.
    const reopened = await load();
    service = reopened.service;
    expect(service.isOn()).toBe(true); // the cache, until the server answers
    serverAlert = null;
    await reconnect();
    expect(service.isOn()).toBe(false);
    expect(reopened.fired).not.toHaveBeenCalled();
  });

  it('a tap made offline survives a restart and is sent on the next connect', async () => {
    let { service } = await load();
    hub.online = false;
    await service.enable('driver', HERE);
    await settle();
    expect(calls('SetWalkerAlert')).toHaveLength(0);
    expect(service.isOn()).toBe(true);

    ({ service } = await load()); // the app was closed and reopened
    expect(service.isOn()).toBe(true);
    hub.online = true;
    await reconnect();

    expect(calls('SetWalkerAlert')).toEqual([['SetWalkerAlert', 'driver', 41.3, 69.2]]);
    const order = hub.conn.invoke.mock.calls.map((c) => c[0]);
    expect(order.indexOf('SetWalkerAlert')).toBeLessThan(order.indexOf('GetWalkerAlert'));
    expect(service.isOn()).toBe(true);
    expect(service.pending()).toBeNull();
  });

  it('a wish older than the alert\'s lifetime is void', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      on: true, until: null,
      wish: { kind: 'set', role: 'driver', lat: 41.3, lng: 69.2, at: Date.now() - 4 * 3_600_000 },
    }));
    const { service } = await load();

    expect(service.isOn()).toBe(false);
    await reconnect();
    expect(calls('SetWalkerAlert')).toHaveLength(0);
  });

  it('a cached "on" past its expiry is off even before the server answers', async () => {
    localStorage.setItem(KEY, JSON.stringify({ on: true, until: Date.now() - 1, wish: null }));
    const { service } = await load();
    expect(service.isOn()).toBe(false);
  });

  it('fires once: off, and one toast', async () => {
    const { service, fired } = await load();
    await service.enable('passenger', HERE);
    await settle();

    push('WalkerAlertFired', { walkerUserId: '7', role: 'driver', distanceKm: 3.2 });

    expect(fired).toHaveBeenCalledTimes(1);
    expect(service.isOn()).toBe(false);
  });

  it('someone is nearby already: the server answers null and fires at once', async () => {
    hub.conn.invoke.mockImplementation((method: string) => {
      if (method !== 'SetWalkerAlert') return Promise.resolve(null);
      push('WalkerAlertFired', { walkerUserId: '7', role: 'driver', distanceKm: 1 });
      return Promise.resolve(null);
    });
    const { service, fired } = await load();

    await service.enable('passenger', HERE);
    await settle();

    expect(fired).toHaveBeenCalledTimes(1);
    expect(service.isOn()).toBe(false);
  });

  it('follows another device and the server taking it down', async () => {
    const { service, fired } = await load();

    push('WalkerAlertChanged', armed);
    expect(service.isOn()).toBe(true);

    push('WalkerAlertChanged', null); // expired, role switch, off elsewhere
    expect(service.isOn()).toBe(false);
    expect(fired).not.toHaveBeenCalled();
  });

  it('turning it off wins over an earlier tap still on its way', async () => {
    const { service } = await load();
    hub.online = false;
    await service.enable('passenger', HERE);
    service.disable();
    expect(service.isOn()).toBe(false);

    hub.online = true;
    await reconnect();

    expect(calls('SetWalkerAlert')).toHaveLength(0);
    expect(calls('ClearWalkerAlert')).toHaveLength(1);
    expect(service.isOn()).toBe(false);
  });

  it('a change of mind while the first command is in flight still lands last', async () => {
    let answerSet!: (dto: unknown) => void;
    hub.conn.invoke.mockImplementation((method: string) => (method === 'SetWalkerAlert'
      ? new Promise((resolve) => { answerSet = resolve; })
      : Promise.resolve(null)));
    const { service } = await load();

    await service.enable('passenger', HERE);
    service.disable();
    push('WalkerAlertChanged', armed); // the echo of the first one must not flip it back
    expect(service.isOn()).toBe(false);
    answerSet(armed);
    await settle();

    expect(calls('ClearWalkerAlert')).toHaveLength(1);
    expect(service.isOn()).toBe(false);
    expect(service.pending()).toBeNull();
  });

  it('a refusal means not armed', async () => {
    hub.conn.invoke.mockImplementation(() => Promise.reject(new Error('HubException: nope')));
    const { service } = await load();

    await service.enable('passenger', HERE);
    await settle();

    expect(service.isOn()).toBe(false);
    expect(service.pending()).toBeNull();
  });

  it('asks the device when the position is unknown, and promises nothing without one', async () => {
    const { service } = await load();

    await expect(service.enable('passenger', null)).resolves.toBe(false);
    expect(service.isOn()).toBe(false);
    expect(hub.conn.invoke).not.toHaveBeenCalled();

    geo.getCurrentLatLng.mockResolvedValue(HERE);
    await expect(service.enable('passenger', null)).resolves.toBe(true);
    expect(service.isOn()).toBe(true);
  });

  it('demo mode stays local: no server, and the first simulated walker sets it off', async () => {
    vi.doMock('@/api/client', async (original) => ({ ...(await original<object>()), USE_MOCKS: true }));
    const { service, fired } = await load();

    await service.enable('passenger', null);
    expect(service.isOn()).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();

    service.fireLocally();
    service.fireLocally();
    expect(fired).toHaveBeenCalledTimes(1);
    expect(service.isOn()).toBe(false);

    await service.enable('passenger', null);
    service.disable();
    expect(service.isOn()).toBe(false);
    expect(hub.conn.invoke).not.toHaveBeenCalled();
  });
});
