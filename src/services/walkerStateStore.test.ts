import { beforeEach, describe, expect, it, vi } from 'vitest';

const presence = vi.hoisted(() => ({ syncWalkerState: vi.fn() }));
vi.mock('@/services/realtime', () => ({ presenceClient: presence }));

const { walkerStateStore } = await import('./walkerStateStore');

beforeEach(() => {
  presence.syncWalkerState.mockReset().mockResolvedValue({});
  walkerStateStore.reset();
});

describe('walker session state — what it syncs', () => {
  it('a resync after a reconnect never sends the watch list (WatchRoute owns it)', () => {
    walkerStateStore.hydrate({ watchedWalkerIds: ['7'], activeTripId: '501', freeMode: true });

    walkerStateStore.resync();

    expect(presence.syncWalkerState).toHaveBeenCalledWith({ freeMode: true, engaged: false, activeTripId: 501 });
    expect(walkerStateStore.get().watchedWalkerIds).toEqual(['7']); // still mirrors the server's snapshot
  });

  it('a local patch does not touch the watch list either', () => {
    walkerStateStore.hydrate({ watchedWalkerIds: ['7'] });

    walkerStateStore.patch({ engaged: true, watchedWalkerIds: [] });

    expect(presence.syncWalkerState).toHaveBeenCalledWith({ engaged: true });
    expect(walkerStateStore.get().watchedWalkerIds).toEqual(['7']);
  });

  it('a resync without a journey clears the server\'s reference', () => {
    walkerStateStore.resync();

    expect(presence.syncWalkerState).toHaveBeenCalledWith({ freeMode: false, engaged: false, clearActiveTrip: true });
  });
});
