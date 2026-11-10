import { describe, it, expect } from 'vitest';
import { toBoardWalker, toCreateTripDto, tripToWalker } from './walkerApi';

const form = {
  from: { latlng: [41.3, 69.24] as [number, number], label: 'A' },
  to: { latlng: [41.35, 69.29] as [number, number], label: 'B' },
  date: '2026-11-06', tStart: 8, note: 'No smoking',
};

describe('toCreateTripDto', () => {
  it('sends a driver\'s seats as their own field', () => {
    const dto = toCreateTripDto({ ...form, type: 'driver', seats: '3' });
    expect(dto).toMatchObject({ role: 'Driver', seats: 3, notes: 'No smoking' });
  });

  it('sends no seats for a passenger, or when the driver gave none', () => {
    expect(toCreateTripDto({ ...form, type: 'passenger', seats: '3' })).not.toHaveProperty('seats');
    expect(toCreateTripDto({ ...form, type: 'driver', seats: '' })).not.toHaveProperty('seats');
    expect(toCreateTripDto({ ...form, type: 'driver', seats: 12 })).not.toHaveProperty('seats');
  });
});

describe('toBoardWalker', () => {
  it('revives the row: string id, Date, initials, seats and trips', () => {
    const w = toBoardWalker({ id: '15', userId: '42', type: 'driver', name: 'Aziz Karimov', when: '2026-11-06T03:00:00Z', seats: 3, completedTrips: 12 });
    expect(w).toMatchObject({ id: '15', userId: '42', initials: 'AK', seats: 3, trips: 12 });
    expect(w.when).toBeInstanceOf(Date);
  });

  it('a demo row without an owner uses its own id as the person', () => {
    expect(toBoardWalker({ id: 'w1', type: 'driver', name: 'Aziz' }).userId).toBe('w1');
  });

  it('a passenger row has no seats; a missing count is zero', () => {
    expect(toBoardWalker({ id: '16', type: 'passenger', name: 'Malika', seats: 1 })).toMatchObject({ seats: null, trips: 0 });
  });
});

describe('tripToWalker', () => {
  it('keeps the trip id and takes the owner from driverId', () => {
    expect(tripToWalker({ id: '501', driverId: '42', role: 'Passenger', seats: null })).toMatchObject({ id: '501', userId: '42', type: 'passenger', seats: null });
  });
});
