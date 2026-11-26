// One toast per arrival (the "joined" toast defers to a fired walker alert), and
// UserOnline fetches profiles only when one is really missing.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  handlers: new Map<string, ((p: any) => void)[]>(),
  positions: new Map<string, any>(),
  online: vi.fn(),
  alert: { on: false, firedFor: '' as string },
}));

vi.mock('@/api/client', () => ({ USE_MOCKS: false }));
vi.mock('@/services/realtime', () => ({
  presenceClient: {
    on: (ev: string, fn: (p: any) => void) => {
      h.handlers.set(ev, [...(h.handlers.get(ev) || []), fn]);
      return () => {};
    },
    getPositions: () => [...h.positions.values()],
    setMode: () => Promise.resolve(),
  },
}));
vi.mock('@/api/walkerApi', () => ({ walkerApi: { online: h.online } }));
vi.mock('@/services/geolocation', () => ({ getCurrentLatLng: () => Promise.resolve([41.3, 69.2]) }));
vi.mock('@/services/blockStore', () => ({ BLOCK_EVENT: 'x-block', blockStore: { has: () => false } }));
vi.mock('@/services/walkerAlertService', () => ({
  walkerAlertService: {
    isOn: () => h.alert.on,
    firedFor: (id: string) => h.alert.firedFor === id,
  },
}));

import { JOINED_TOAST_EVERY_MS, usePresence } from '@/hooks/usePresence';
import type { LatLng } from '@/utils/geo';

const emit = (ev: string, p: any) => act(() => { (h.handlers.get(ev) || []).forEach((fn) => fn(p)); });
const flush = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

const argsFor = (notify: (n: any) => void, screen = 'map') => ({
  screen, mode: 'passenger', mapHook: new Proxy({}, { get: () => () => {} }) as any,
  liveWalkersRef: { current: new Map() }, userLocRef: { current: [41.3, 69.2] as LatLng },
  openWalker: () => {}, notify, restoreLiveRoute: () => {}, pendingRestoreRef: { current: null },
  onLocationUnknown: () => {}, onLocated: () => {}, onWalkerCount: () => {},
});

async function mount(notify: (n: any) => void) {
  const view = renderHook(({ screen }: { screen: string }) => usePresence(argsFor(notify, screen)), { initialProps: { screen: 'map' } });
  await flush();
  return view;
}

const near = { userId: '7', lat: 41.31, lng: 69.21, role: 'driver' };

beforeEach(() => {
  h.handlers.clear();
  h.positions.clear();
  h.alert.on = false;
  h.alert.firedFor = '';
  h.online.mockReset().mockResolvedValue([{ id: '7', kind: 'driver', name: 'Ali Valiyev' }]);
});
afterEach(() => { vi.useRealTimers(); });

describe('usePresence toasts', () => {
  it('a nearby walker joining raises the "joined" toast at once when no alert is on', async () => {
    const notify = vi.fn();
    await mount(notify);
    h.positions.set('7', near);
    emit('WalkerJoined', near);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('when that walker set the alert off, only the alert speaks', async () => {
    const notify = vi.fn();
    await mount(notify);
    h.alert.on = true;
    h.positions.set('7', near);
    emit('WalkerJoined', near);
    h.alert.firedFor = '7'; // WalkerAlertFired follows right after
    await flush(500);
    expect(notify).not.toHaveBeenCalled();
  });

  it('with the alert on but set off by nobody (e.g. set elsewhere), the "joined" toast still comes', async () => {
    const notify = vi.fn();
    await mount(notify);
    h.alert.on = true;
    h.positions.set('7', near);
    emit('WalkerJoined', near);
    expect(notify).not.toHaveBeenCalled();
    await flush(500);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe('usePresence "joined" toast: once per walker in 10 minutes', () => {
  const T0 = Date.parse('2026-11-25T08:00:00Z');
  const at = (ms: number) => vi.setSystemTime(new Date(T0 + ms));
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] }); // the clock only: the hook's timers stay real
    at(0);
    h.positions.set('7', near);
  });

  it('someone who closes and reopens the app is not announced again within 10 minutes, then is', async () => {
    const notify = vi.fn();
    await mount(notify);

    emit('WalkerJoined', near);
    emit('WalkerGone', '7'); // closed the app …
    at(JOINED_TOAST_EVERY_MS - 1);
    emit('WalkerJoined', near); // … and opened it again: the server announces them again
    expect(notify).toHaveBeenCalledTimes(1);

    at(JOINED_TOAST_EVERY_MS);
    emit('WalkerJoined', near);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('is kept per walker: someone else is announced meanwhile', async () => {
    const notify = vi.fn();
    await mount(notify);
    const other = { ...near, userId: '8' };
    h.positions.set('8', other);

    emit('WalkerJoined', near);
    at(60_000);
    emit('WalkerJoined', other);
    emit('WalkerJoined', near);

    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('the alert a walker set off counts as their announcement', async () => {
    const notify = vi.fn();
    await mount(notify);
    h.alert.on = true;

    emit('WalkerJoined', near);
    h.alert.firedFor = '7'; // the alert spoke for them (and is off now)
    await flush(500);
    h.alert.on = false;
    h.alert.firedFor = '';
    at(2 * 60_000);
    emit('WalkerGone', '7');
    emit('WalkerJoined', near);

    expect(notify).not.toHaveBeenCalled();
  });

  it('leaving the map and coming back does not announce them again', async () => {
    const notify = vi.fn();
    const view = await mount(notify);

    emit('WalkerJoined', near);
    view.rerender({ screen: 'home' });
    view.rerender({ screen: 'map' });
    await flush();
    emit('WalkerJoined', near);

    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe('usePresence profile refresh on UserOnline', () => {
  it('does not refetch for someone who is not on the map or already known', async () => {
    h.positions.set('7', near);
    await mount(() => {});
    const calls = h.online.mock.calls.length;

    emit('UserOnline', '99'); // anyone, not a walker on my map
    emit('UserOnline', '7'); // on the map, profile known
    await flush(1000);
    expect(h.online.mock.calls.length).toBe(calls);
  });

  it('refetches when a walker on the map has no profile yet', async () => {
    await mount(() => {});
    const calls = h.online.mock.calls.length;
    h.positions.set('8', { ...near, userId: '8' });

    emit('UserOnline', '8');
    await flush(1000);
    expect(h.online.mock.calls.length).toBe(calls + 1);
  });
});
