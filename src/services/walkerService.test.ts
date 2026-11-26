import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { i18nStore, t } from '@/i18n';
import type { Walker } from '@/models';
import { errorMessage, isConflict, isOpenPlanLimit } from '@/utils/errors';
import { composeNotes, matchWalkers, submitTrip } from './walkerService';

const api = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@/api/walkerApi', () => ({ walkerApi: api }));
const route = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('@/services/routeService', () => ({ RouteServer: route }));

beforeEach(() => {
  i18nStore.set('en');
  api.create.mockReset();
  route.save.mockReset();
});

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

  it('the Driver / Passenger chips filter the mixed board; "all" keeps both roles', () => {
    const when = new Date(2026, 8, 25, 9);
    const mixed = [walker('d1', when), { ...walker('p1', when), type: 'passenger' as const }, walker('d2', when)];
    const base = { date: '', tStart: 0, tEnd: 24 };
    expect(matchWalkers(mixed, { ...base, type: 'driver' }, [41.3, 69.24]).map((w) => w.id)).toEqual(['d1', 'd2']);
    expect(matchWalkers(mixed, { ...base, type: 'passenger' }, [41.3, 69.24]).map((w) => w.id)).toEqual(['p1']);
    expect(matchWalkers(mixed, { ...base, type: 'all' }, [41.3, 69.24])).toHaveLength(3);
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

  it('keeps the typed note and the departure window — seats are a field of their own', () => {
    expect(composeNotes(base)).toBe('No smoking\nDeparture window: 08:00–10:00');
  });

  it('returns null when there is nothing to say', () => {
    expect(composeNotes({ ...base, note: '  ', tEnd: 8 })).toBeNull();
    expect(composeNotes({ ...base, type: 'passenger', note: '', tEnd: 8 })).toBeNull();
  });
});

describe('submitTrip', () => {
  const form = {
    type: 'driver' as const, from: { latlng: [41.3, 69.24] as [number, number], label: 'A' },
    to: { latlng: [41.35, 69.29] as [number, number], label: 'B' }, date: '2026-09-26', tStart: 8, tEnd: 10, seats: '3', note: '',
  };

  it('publishes the plan and precomputes its route', async () => {
    api.create.mockResolvedValue({ id: '77' });

    await expect(submitTrip(form)).resolves.toEqual({ id: '77' });
    expect(route.save).toHaveBeenCalledWith('77', form.from.latlng, form.to.latlng);
  });

  it('a plan over the open-plan limit fails with its own error — never as "already published"', async () => {
    api.create.mockRejectedValue(new ApiError(409, 'You already have 10 upcoming planned trips.', ['open_plan_limit']));

    const e = await submitTrip(form).catch((err: unknown) => err);

    expect(isConflict(e)).toBe(false); // the form's "already published" branch is for duplicates only
    expect(isOpenPlanLimit(e)).toBe(true);
    expect(errorMessage(e, 'errors.sendFailed')).toBe(t('errors.openPlanLimit', { n: 10 }));
    expect(route.save).not.toHaveBeenCalled();
  });

  it('a duplicate stays the 409 it is', async () => {
    const dup = new ApiError(409, 'You have already published this trip.', ['duplicate_trip']);
    api.create.mockRejectedValue(dup);

    await expect(submitTrip(form)).rejects.toBe(dup);
  });
});
