// A journey of mine waiting to be redrawn goes on the map once it is up in that
// journey's role — whether or not the device location is known.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const h = vi.hoisted(() => ({ loc: null as [number, number] | null }));

vi.mock('@/api/client', () => ({ USE_MOCKS: false }));
vi.mock('@/services/realtime', () => ({
  presenceClient: {
    on: () => () => {},
    getPositions: () => [],
    setMode: () => Promise.resolve(),
  },
}));
vi.mock('@/api/walkerApi', () => ({ walkerApi: { online: () => Promise.resolve([]) } }));
vi.mock('@/services/geolocation', () => ({ getCurrentLatLng: () => Promise.resolve(h.loc) }));
vi.mock('@/services/blockStore', () => ({ BLOCK_EVENT: 'x-block', blockStore: { has: () => false } }));
vi.mock('@/services/walkerAlertService', () => ({ walkerAlertService: { isOn: () => false, firedFor: () => false } }));

import { usePresence } from '@/hooks/usePresence';
import type { PendingRestore } from '@/hooks/usePresence';
import type { LatLng } from '@/utils/geo';

const journey = { id: 501, status: 'InProgress', role: 'Driver' };

async function mount(mode: string, pending: PendingRestore | null) {
  const pendingRestoreRef = { current: pending };
  const restoreLiveRoute = vi.fn();
  const onLocationUnknown = vi.fn();
  renderHook(() => usePresence({
    screen: 'map', mode, mapHook: new Proxy({}, { get: () => () => {} }) as any,
    liveWalkersRef: { current: new Map() }, userLocRef: { current: null as LatLng | null },
    openWalker: () => {}, notify: () => {}, restoreLiveRoute, pendingRestoreRef,
    onLocationUnknown, onLocated: () => {}, onWalkerCount: () => {},
  }));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return { pendingRestoreRef, restoreLiveRoute, onLocationUnknown };
}

beforeEach(() => { h.loc = null; });

describe('usePresence auto-resume', () => {
  it('redraws the journey without a location fix (navigation waits for the GPS)', async () => {
    const { pendingRestoreRef, restoreLiveRoute, onLocationUnknown } = await mount('driver', { trip: journey, role: 'driver' });

    expect(onLocationUnknown).toHaveBeenCalled();
    expect(restoreLiveRoute).toHaveBeenCalledWith(journey);
    expect(pendingRestoreRef.current).toBeNull();
  });

  it('redraws it with a location fix too', async () => {
    h.loc = [41.3, 69.2];
    const { restoreLiveRoute } = await mount('driver', { trip: journey, role: 'driver' });

    expect(restoreLiveRoute).toHaveBeenCalledWith(journey);
  });

  it('never in another role: it waits for the map of its own — with or without a fix', async () => {
    const without = await mount('passenger', { trip: journey, role: 'driver' });
    h.loc = [41.3, 69.2];
    const withFix = await mount('passenger', { trip: journey, role: 'driver' });

    [without, withFix].forEach(({ pendingRestoreRef, restoreLiveRoute }) => {
      expect(restoreLiveRoute).not.toHaveBeenCalled();
      expect(pendingRestoreRef.current).toEqual({ trip: journey, role: 'driver' });
    });
  });

  it('does nothing without a journey to redraw', async () => {
    const { restoreLiveRoute } = await mount('driver', null);

    expect(restoreLiveRoute).not.toHaveBeenCalled();
  });
});
