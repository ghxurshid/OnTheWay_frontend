import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/realtime', () => ({
  presenceClient: { on: () => () => {}, onResync: () => () => {}, connection: () => null, clearRoute: () => Promise.resolve() },
}));
vi.mock('@/api/blocksApi', () => ({ blocksApi: { list: async () => [], block: async () => ({}), unblock: async () => {} } }));

const KEY = 'ontheway_ride_companions_v1';

async function load() {
  vi.resetModules();
  return import('./liveTripService');
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); });

describe('ride companions', () => {
  it('are kept with the time of the agreement, once each', async () => {
    const { recordCompanion, recordedCompanions, forgetCompanion } = await load();
    recordCompanion('7');
    recordCompanion('8');
    recordCompanion('7');

    expect(recordedCompanions().sort()).toEqual(['7', '8']);
    forgetCompanion('7');
    expect(recordedCompanions()).toEqual(['8']);
  });

  it('a companion agreed more than a day ago never lands on a later trip', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-10T08:00:00Z'));
    const { recordCompanion, recordedCompanions, COMPANION_LIFETIME_MS } = await load();
    recordCompanion('7');

    vi.setSystemTime(new Date(Date.parse('2026-11-10T08:00:00Z') + COMPANION_LIFETIME_MS - 1));
    expect(recordedCompanions()).toEqual(['7']);
    vi.setSystemTime(new Date(Date.parse('2026-11-10T08:00:00Z') + COMPANION_LIFETIME_MS + 1));
    expect(recordedCompanions()).toEqual([]);
  });

  it('the older bare-id list is stamped once and then expires like the rest', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-10T08:00:00Z'));
    localStorage.setItem(KEY, JSON.stringify(['7']));
    const { recordedCompanions, COMPANION_LIFETIME_MS } = await load();

    expect(recordedCompanions()).toEqual(['7']);
    expect(JSON.parse(localStorage.getItem(KEY) || '[]')).toEqual([{ peerId: '7', at: Date.parse('2026-11-10T08:00:00Z') }]);
    vi.setSystemTime(new Date(Date.parse('2026-11-10T08:00:00Z') + COMPANION_LIFETIME_MS + 1));
    expect(recordedCompanions()).toEqual([]);
  });
});
