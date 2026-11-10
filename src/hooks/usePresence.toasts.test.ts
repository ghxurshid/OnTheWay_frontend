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

import { usePresence } from '@/hooks/usePresence';
import type { LatLng } from '@/utils/geo';

const emit = (ev: string, p: any) => act(() => { (h.handlers.get(ev) || []).forEach((fn) => fn(p)); });
const flush = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

async function mount(notify: (n: any) => void) {
  renderHook(() => usePresence({
    screen: 'map', mode: 'passenger', mapHook: new Proxy({}, { get: () => () => {} }) as any,
    liveWalkersRef: { current: new Map() }, userLocRef: { current: [41.3, 69.2] as LatLng },
    openWalker: () => {}, notify, restoreLiveRoute: () => {}, pendingRestoreRef: { current: null },
    onLocationUnknown: () => {}, onLocated: () => {}, onWalkerCount: () => {},
  }));
  await flush();
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
