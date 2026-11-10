import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { ApiError } from '@/api/client';
import { agreementStore } from '@/services/agreementStore';
import { blockStore } from '@/services/blockStore';
import { journeyRating } from '@/services/journeyRating';
import { useCompanionRating } from './useCompanionRating';

const hub = vi.hoisted(() => ({ handlers: new Map<string, (payload: unknown) => unknown>() }));
vi.mock('@/services/realtime', () => ({
  presenceClient: {
    on: (event: string, fn: (payload: unknown) => unknown) => { hub.handlers.set(event, fn); return () => {}; },
    onResync: () => () => {},
    connection: () => null,
  },
}));
vi.mock('@/api/blocksApi', () => ({
  blocksApi: {
    list: async () => [],
    block: async (userId: string) => ({ userId, name: '', photoUrl: null, blockedAt: '2026-11-06T08:00:00Z' }),
    unblock: async () => {},
  },
}));
const walkers = vi.hoisted(() => ({ profile: vi.fn() }));
vi.mock('@/api/walkerApi', () => ({ walkerApi: walkers }));
vi.mock('@/services/authStore', () => ({ authStore: { getUser: () => ({ id: '9' }) } }));
const companions = vi.hoisted(() => ({ forgetCompanion: vi.fn() }));
vi.mock('@/services/liveTripService', () => companions);

const event = (over: Record<string, unknown> = {}) => ({
  type: 'completed',
  actorUserId: '7',
  trip: {
    id: '501', role: 'Driver', companionIds: ['9'], distanceKm: 12.5, estimatedMinutes: 25,
    origin: { latitude: 41.3, longitude: 69.2, address: 'Chilonzor' },
    destination: { latitude: 41.35, longitude: 69.29, address: 'Yunusobod' },
  },
  ...over,
});

const fire = (evt: unknown) => act(async () => { await hub.handlers.get('TripEvent')?.(evt); });

function mount(activeRoute: unknown = null) {
  const onOffer = vi.fn();
  const activeRouteRef = { current: activeRoute };
  const view = renderHook(({ route }) => useCompanionRating({ authReady: true, activeRoute: route, activeRouteRef, onOffer }),
    { initialProps: { route: activeRoute } });
  return { onOffer, activeRouteRef, view };
}

beforeEach(() => {
  localStorage.clear();
  agreementStore.reset();
  // Earlier cases' memory: the service reads storage only once.
  journeyRating.takeWaiting();
  walkers.profile.mockReset().mockResolvedValue({ id: '7', name: 'Aziz Karimov', vehicle: 'Cobalt', photoUrl: null });
  companions.forgetCompanion.mockReset();
});
afterEach(cleanup);

describe('their trip completed — I am not navigating', () => {
  it('offers the summary now, on their trip, with the person from their profile', async () => {
    const { onOffer } = mount();
    await fire(event());
    expect(onOffer).toHaveBeenCalledTimes(1);
    expect(onOffer.mock.calls[0][0]).toMatchObject({
      tripId: '501', distanceKm: 12.5, durationMin: 25,
      peer: { id: '7', name: 'Aziz Karimov', initials: 'AK', type: 'driver', vehicle: 'Cobalt' },
      route: { from: { label: 'Chilonzor' }, to: { label: 'Yunusobod' } },
    });
    expect(companions.forgetCompanion).toHaveBeenCalledWith('7'); // not on my next trip
  });

  it('prefers the person from the agreement that is still up', async () => {
    const { onOffer } = mount();
    agreementStore.hydrate([{ id: 'a1', peer: { userId: '7', name: 'Aziz', type: 'driver' }, status: 'agreed' }]);
    await fire(event());
    expect(walkers.profile).not.toHaveBeenCalled();
    expect(onOffer.mock.calls[0][0].peer).toMatchObject({ id: '7', name: 'Aziz' });
  });

  it('offers once per journey — a repeat or their second trip does nothing', async () => {
    const { onOffer } = mount();
    await fire(event({ actorUserId: '70' }));
    await fire(event({ actorUserId: '70' }));
    expect(onOffer).toHaveBeenCalledTimes(1);
  });

  it('ignores what is not a journey of mine', async () => {
    const { onOffer } = mount();
    await fire(event({ actorUserId: '9' })); // my own completion
    await fire(event({ actorUserId: '71', type: 'cancelled' }));
    await fire(event({ actorUserId: '71', trip: { id: '5', companionIds: ['1'] } })); // not a companion
    expect(onOffer).not.toHaveBeenCalled();
  });

  it('does nothing when the server no longer shows them (404: blocked)', async () => {
    walkers.profile.mockRejectedValueOnce(new ApiError(404, 'not found'));
    const { onOffer } = mount();
    await fire(event({ actorUserId: '72' }));
    expect(onOffer).not.toHaveBeenCalled();
  });
});

describe('their trip completed — I am navigating', () => {
  it('remembers them instead of interrupting, for my own finish', async () => {
    const { onOffer } = mount({ distanceKm: 3 });
    await fire(event({ actorUserId: '73' }));
    expect(onOffer).not.toHaveBeenCalled();
    expect(companions.forgetCompanion).not.toHaveBeenCalled(); // still my companion
    const { partner, tripId } = journeyRating.forFinish({ agreementPeer: null, myTripId: '600', myCompanions: [] });
    expect(partner).toMatchObject({ id: '73' });
    expect(tripId).toBe('501'); // not my companion on this device: their trip
  });

  it('blocked after being remembered: the end of the route does not offer them', async () => {
    const { onOffer, view } = mount({ distanceKm: 3 });
    await fire(event({ actorUserId: '75' }));
    await act(async () => { await blockStore.add('75'); });
    view.rerender({ route: null });
    expect(onOffer).not.toHaveBeenCalled();
    await act(async () => { await blockStore.remove('75'); });
  });

  it('a route that ends without a finish offers what was remembered', async () => {
    const { onOffer, view } = mount({ distanceKm: 3 });
    await fire(event({ actorUserId: '74' }));
    view.rerender({ route: null });
    expect(onOffer).toHaveBeenCalledTimes(1);
    expect(onOffer.mock.calls[0][0]).toMatchObject({ tripId: '501', peer: { id: '74' } });
  });
});
