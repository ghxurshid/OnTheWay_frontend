// routePoints must survive the walker entry being rebuilt on a position update, and go
// away on RouteCleared / WalkerGone / a republish without a line.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  handlers: new Map<string, ((p: any) => void)[]>(),
  positions: new Map<string, any>(),
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
    onResync: () => () => {},
    connection: () => null,
  },
}));
vi.mock('@/api/walkerApi', () => ({
  walkerApi: { online: () => Promise.resolve([{ id: '7', kind: 'driver', name: 'Ali Valiyev' }]) },
}));
vi.mock('@/services/geolocation', () => ({ getCurrentLatLng: () => Promise.resolve([41.3, 69.2]) }));
vi.mock('@/services/blockStore', () => ({ BLOCK_EVENT: 'x-block', blockStore: { has: () => false } }));

import { usePresence } from '@/hooks/usePresence';
import { routeMatchPercent } from '@/utils/geo';
import type { LatLng } from '@/utils/geo';

const emit = (ev: string, p: any) => act(() => { (h.handlers.get(ev) || []).forEach((fn) => fn(p)); });

const line = [{ lat: 41.3, lng: 69.2 }, { lat: 41.3, lng: 69.25 }, { lat: 41.3, lng: 69.3 }];
const coords: LatLng[] = line.map((p) => [p.lat, p.lng]);
const published = (points = line) => ({
  userId: '7', origin: points[0], destination: points[points.length - 1],
  originLabel: 'A', destinationLabel: 'B', points,
});

async function mount() {
  const liveWalkersRef = { current: new Map<any, any>() };
  const mapHook: any = new Proxy({}, { get: () => () => {} });
  renderHook(() => usePresence({
    screen: 'map', mode: 'passenger', mapHook, liveWalkersRef, userLocRef: { current: [41.3, 69.2] as LatLng },
    openWalker: () => {}, notify: () => {}, restoreLiveRoute: () => {}, pendingRestoreRef: { current: null },
    onLocationUnknown: () => {}, onLocated: () => {}, onWalkerCount: () => {},
  }));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return liveWalkersRef;
}

const pos = { userId: '7', lat: 41.3, lng: 69.21, role: 'driver' };

describe('usePresence routePoints', () => {
  beforeEach(() => { h.handlers.clear(); h.positions.clear(); h.positions.set('7', pos); });

  it('keeps the line on the entry across a position update (the entry is rebuilt)', async () => {
    const ref = await mount();
    emit('RoutePublished', published());
    expect(ref.current.get('7').routePoints).toEqual(coords);
    const before = ref.current.get('7');
    emit('WalkerMoved', { ...pos, lng: 69.22 });
    const after = ref.current.get('7');
    expect(after).not.toBe(before); // rebuilt: a field set only on the entry would be lost here
    expect(after.routePoints).toEqual(coords);
    expect(after.start).toEqual(coords[0]);
    expect(routeMatchPercent(coords, after.routePoints)).toBe(100);
  });

  it('keeps it across a Walkers snapshot too', async () => {
    const ref = await mount();
    emit('RoutePublished', published());
    emit('Walkers', [pos]);
    expect(ref.current.get('7').routePoints).toEqual(coords);
  });

  it('arrives on the entry when the route is published before the marker exists', async () => {
    h.positions.clear();
    const ref = await mount();
    emit('RoutePublished', published());
    h.positions.set('7', pos);
    emit('WalkerJoined', pos);
    expect(ref.current.get('7').routePoints).toEqual(coords);
  });

  it('clears on RouteCleared, and stays cleared after the next position update', async () => {
    const ref = await mount();
    emit('RoutePublished', published());
    emit('RouteCleared', '7');
    expect(ref.current.get('7').routePoints).toBeNull();
    expect(ref.current.get('7').start).toBeNull();
    emit('WalkerMoved', { ...pos, lng: 69.22 });
    expect(ref.current.get('7').routePoints ?? null).toBeNull();
    expect(routeMatchPercent(coords, ref.current.get('7').routePoints ?? [])).toBeNull();
  });

  it('forgets it on WalkerGone: a returning walker has no route until they publish', async () => {
    const ref = await mount();
    emit('RoutePublished', published());
    h.positions.delete('7');
    emit('WalkerGone', '7');
    expect(ref.current.has('7')).toBe(false);
    h.positions.set('7', pos);
    emit('WalkerJoined', pos);
    expect(ref.current.get('7').routePoints ?? null).toBeNull();
  });

  it('a republish with a single point replaces the old line, leaving none', async () => {
    const ref = await mount();
    emit('RoutePublished', published());
    emit('RoutePublished', published([line[0]]));
    expect(ref.current.get('7').routePoints).toBeNull();
    emit('WalkerMoved', { ...pos, lng: 69.22 });
    expect(ref.current.get('7').routePoints).toBeNull();
  });

  it('a republish replaces the old line', async () => {
    const ref = await mount();
    emit('RoutePublished', published());
    const next = [{ lat: 41.4, lng: 69.2 }, { lat: 41.4, lng: 69.3 }];
    emit('RoutePublished', published(next));
    emit('WalkerMoved', { ...pos, lng: 69.22 });
    expect(ref.current.get('7').routePoints).toEqual(next.map((p) => [p.lat, p.lng]));
  });

  it('drops malformed points rather than handing them to the geometry', async () => {
    const ref = await mount();
    emit('RoutePublished', published([line[0], { lat: null, lng: null } as any, line[2]]));
    expect(ref.current.get('7').routePoints).toEqual([coords[0], coords[2]]);
  });
});
