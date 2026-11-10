import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgreementPeer } from './agreementStore';

const peer = (id: string): AgreementPeer => ({ id, name: `User ${id}`, initials: 'U', type: 'driver' });

/** Fresh modules (the memory is read from storage on import). */
async function load() {
  vi.resetModules();
  const { journeyRating, completedBy } = await import('./journeyRating');
  const { agreementStore } = await import('./agreementStore');
  return { journeyRating, completedBy, agreementStore };
}

beforeEach(() => localStorage.clear());

describe('completedBy', () => {
  const evt = { type: 'completed', actorUserId: 7, trip: { id: 5, companionIds: [9, '10'] } };

  it('names the person who completed a trip I was a companion on (ids in any form)', async () => {
    const { completedBy } = await load();
    expect(completedBy(evt, '9')).toBe('7');
    expect(completedBy(evt, '10')).toBe('7');
  });

  it('is null for anything else', async () => {
    const { completedBy } = await load();
    expect(completedBy(evt, '7')).toBeNull(); // my own completion
    expect(completedBy(evt, '11')).toBeNull(); // not my journey
    expect(completedBy({ ...evt, type: 'started' }, '9')).toBeNull();
    expect(completedBy({ type: 'completed', actorUserId: 7 }, '9')).toBeNull();
    expect(completedBy(evt, '')).toBeNull(); // don't know who I am yet
    expect(completedBy(null, '9')).toBeNull();
  });
});

describe('my own finish', () => {
  it('rates on my own trip when they are my recorded companion', async () => {
    const { journeyRating } = await load();
    expect(journeyRating.forFinish({ agreementPeer: peer('7'), myTripId: '600', myCompanions: ['7'] }))
      .toMatchObject({ partner: { id: '7' }, tripId: '600' });
  });

  it('their trip was remembered and they are not recorded here: rates on their trip', async () => {
    const { journeyRating } = await load();
    journeyRating.remember({ peer: peer('7'), tripId: '501', distanceKm: 1, durationMin: 2 });
    expect(journeyRating.forFinish({ agreementPeer: null, myTripId: '600', myCompanions: [] }))
      .toMatchObject({ partner: { id: '7' }, tripId: '501' });
  });

  it('remembered AND my companion: my own trip wins', async () => {
    const { journeyRating } = await load();
    journeyRating.remember({ peer: peer('7'), tripId: '501', distanceKm: 1, durationMin: 2 });
    expect(journeyRating.forFinish({ agreementPeer: null, myTripId: '600', myCompanions: ['7'] }))
      .toMatchObject({ partner: { id: '7' }, tripId: '600' });
  });

  it('nothing valid to rate on yet: no offer now (their completion opens it later)', async () => {
    const { journeyRating } = await load();
    expect(journeyRating.forFinish({ agreementPeer: peer('7'), myTripId: '600', myCompanions: [] }).partner).toBeNull();
    expect(journeyRating.forFinish({ agreementPeer: peer('7'), myTripId: null, myCompanions: ['7'] }).partner).toBeNull();
    expect(journeyRating.wasOffered('7')).toBe(false);
  });

  it('no partner at all', async () => {
    const { journeyRating } = await load();
    expect(journeyRating.forFinish({ agreementPeer: null, myTripId: '600', myCompanions: [] }))
      .toEqual({ partner: null, tripId: '600' });
  });

  it('a demo walker is offered without a trip (the rating stays local)', async () => {
    const { journeyRating } = await load();
    expect(journeyRating.forFinish({ agreementPeer: peer('sim_3'), myTripId: null, myCompanions: [] }))
      .toMatchObject({ partner: { id: 'sim_3' }, tripId: null });
  });

  // E2E 2026-11-06: their trip completed while I was navigating, then I blocked them.
  it('does not offer someone I blocked after their trip was remembered', async () => {
    localStorage.setItem('otw-blocked', JSON.stringify([{ userId: '7', name: 'User 7', photoUrl: null, blockedAt: '2026-11-06T08:00:00Z' }]));
    const { journeyRating } = await load();
    journeyRating.remember({ peer: peer('7'), tripId: '500', distanceKm: 3, durationMin: 8 });
    expect(journeyRating.forFinish({ agreementPeer: null, myTripId: '600', myCompanions: [] }).partner).toBeNull();
  });
});

describe('remembered trips', () => {
  it('a second one does not drop the first: the unused one waits for the end of the route', async () => {
    const { journeyRating } = await load();
    journeyRating.remember({ peer: peer('7'), tripId: '501', distanceKm: 1, durationMin: 2 });
    journeyRating.remember({ peer: peer('8'), tripId: '502', distanceKm: 1, durationMin: 2 });
    expect(journeyRating.forFinish({ agreementPeer: null, myTripId: '600', myCompanions: [] }))
      .toMatchObject({ partner: { id: '7' }, tripId: '501' });
    expect(journeyRating.takeWaiting().map((w) => w.peer.id)).toEqual(['8']);
  });

  it('the agreed person is the one offered at the finish; the remembered one still waits', async () => {
    const { journeyRating } = await load();
    journeyRating.remember({ peer: peer('8'), tripId: '502', distanceKm: 1, durationMin: 2 });
    expect(journeyRating.forFinish({ agreementPeer: peer('7'), myTripId: '600', myCompanions: ['7'] }))
      .toMatchObject({ partner: { id: '7' }, tripId: '600' });
    expect(journeyRating.takeWaiting().map((w) => w.peer.id)).toEqual(['8']);
  });

  it('expires after a day (a route abandoned long ago does not prompt)', async () => {
    const { journeyRating } = await load();
    vi.useFakeTimers({ now: new Date('2026-11-06T08:00:00Z') });
    try {
      journeyRating.remember({ peer: peer('7'), tripId: '501', distanceKm: 1, durationMin: 2 });
      vi.setSystemTime(new Date('2026-11-07T09:00:00Z'));
      expect(journeyRating.takeWaiting()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads the single entry an older build stored', async () => {
    localStorage.setItem('ontheway_journey_ratings_v1', JSON.stringify({ offered: {}, waiting: { peer: peer('7'), tripId: '501', distanceKm: 1, durationMin: 2 } }));
    const { journeyRating } = await load();
    expect(journeyRating.takeWaiting().map((w) => w.tripId)).toEqual(['501']);
  });
});

describe('one rating per person per journey', () => {
  it('my finish, then their completion: the second is not offered — even after a restart', async () => {
    let { journeyRating } = await load();
    journeyRating.forFinish({ agreementPeer: peer('7'), myTripId: '600', myCompanions: ['7'] });
    expect(journeyRating.wasOffered('7')).toBe(true);
    ({ journeyRating } = await load());
    expect(journeyRating.wasOffered('7')).toBe(true);
  });

  it('their completion offered first: my later finish does not offer them again', async () => {
    const { journeyRating } = await load();
    journeyRating.markOffered('7');
    journeyRating.remember({ peer: peer('7'), tripId: '501', distanceKm: 1, durationMin: 2 });
    expect(journeyRating.forFinish({ agreementPeer: null, myTripId: '600', myCompanions: ['7'] }).partner).toBeNull();
  });

  it('a new agreement with them starts a new journey', async () => {
    const { journeyRating, agreementStore } = await load();
    agreementStore.reset();
    journeyRating.markOffered('7');
    agreementStore.set({ peer: peer('7'), status: 'pending', since: Date.now() });
    expect(journeyRating.wasOffered('7')).toBe(true); // only an offer so far
    agreementStore.patch({ status: 'agreed' });
    expect(journeyRating.wasOffered('7')).toBe(false);
  });

  it('the agreement that was up when offered does not start a new journey (a slow "ended")', async () => {
    const { journeyRating, agreementStore } = await load();
    agreementStore.reset();
    const dto = { id: 'a1', peer: { userId: '7', name: 'Aziz', type: 'driver' }, status: 'agreed' };
    agreementStore.hydrate([dto]);
    journeyRating.markOffered('7');
    agreementStore.hydrate([{ ...dto, version: 2 }]); // its update, before it ends
    expect(journeyRating.wasOffered('7')).toBe(true);
    agreementStore.remove('a1');
    expect(journeyRating.wasOffered('7')).toBe(true);
    agreementStore.hydrate([{ ...dto, id: 'a2' }]);
    expect(journeyRating.wasOffered('7')).toBe(false);
  });
});
