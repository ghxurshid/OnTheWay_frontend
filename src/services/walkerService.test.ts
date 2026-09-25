import { describe, it, expect, beforeEach } from 'vitest';
import { i18nStore } from '@/i18n';
import type { Walker } from '@/models';
import { composeNotes, matchWalkers } from './walkerService';

beforeEach(() => i18nStore.set('en'));

const walker = (id: string, when: Date): Walker => ({
  id, type: 'driver', name: id, initials: 'W', from: 'A', to: 'B',
  fromLatlng: [41.3, 69.24], toLatlng: [41.35, 69.29], when, rating: null, vehicle: null,
});

describe('matchWalkers', () => {
  it('respects the chosen date as well as the time window', () => {
    const today = new Date(2026, 8, 25, 8, 30);
    const tomorrow = new Date(2026, 8, 26, 8, 30);
    const found = matchWalkers([walker('today', today), walker('tomorrow', tomorrow)],
      { type: 'all', date: '2026-09-26', tStart: 8, tEnd: 10 }, [41.3, 69.24]);
    expect(found.map((w) => w.id)).toEqual(['tomorrow']);
  });

  it('any day when no date is chosen', () => {
    const found = matchWalkers([walker('a', new Date(2026, 8, 25, 9)), walker('b', new Date(2026, 8, 27, 9))],
      { type: 'all', date: '', tStart: 8, tEnd: 10 }, [41.3, 69.24]);
    expect(found).toHaveLength(2);
  });
});

describe('composeNotes', () => {
  const base = {
    type: 'driver' as const, from: { latlng: [41.3, 69.24] as [number, number], label: 'A' },
    to: { latlng: [41.35, 69.29] as [number, number], label: 'B' }, date: '2026-09-26', tStart: 8, tEnd: 10, seats: '3', note: 'No smoking',
  };

  it('keeps the seats and the departure window the form collected', () => {
    expect(composeNotes(base)).toBe('No smoking\nFree seats: 3\nDeparture window: 08:00–10:00');
  });

  it('omits seats for a passenger and returns null when empty', () => {
    expect(composeNotes({ ...base, type: 'passenger', note: '', tEnd: 8 })).toBeNull();
  });
});
