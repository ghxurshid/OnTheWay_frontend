import { describe, it, expect } from 'vitest';
import { enrichLiveWalker } from './liveWalkers';

describe('enrichLiveWalker', () => {
  it('maps the profile counters and a driver\'s car onto the walker', () => {
    const w = enrichLiveWalker({
      id: 42, kind: 'driver', name: 'Aziz Karimov', vehicle: 'Cobalt · oq · 01A777BB', rating: 4.8,
      seats: 3, completedTrips: 17, sharedTrips: 2,
      vehicleInfo: { model: 'Cobalt', color: 'oq', plate: '01A777BB', seats: 4 },
    }, { lat: 41.3, lng: 69.2, heading: 90 });

    expect(w).toMatchObject({
      id: '42', type: 'driver', initials: 'AK', vehicle: 'Cobalt · oq · 01A777BB', rating: 4.8,
      seats: 3, trips: 17, sharedTrips: 2, vehicleInfo: { model: 'Cobalt', plate: '01A777BB' },
      position: [41.3, 69.2], heading: 90,
    });
  });

  it('a passenger has no seats or car; missing counters are zero', () => {
    const w = enrichLiveWalker({ id: '9', kind: 'passenger', name: 'Malika', seats: 2, vehicleInfo: { model: 'x', color: null, plate: null, seats: 1 } });
    expect(w).toMatchObject({ id: '9', seats: null, vehicleInfo: null, trips: 0, sharedTrips: 0, position: null });
  });

  it('ignores a nonsense seat count', () => {
    expect(enrichLiveWalker({ id: '1', kind: 'driver', seats: null }).seats).toBeNull();
    expect(enrichLiveWalker({ id: '1', kind: 'driver', seats: 0 }).seats).toBeNull();
  });
});
