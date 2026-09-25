import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { i18nStore, t } from '@/i18n';
import { fmtLastSeen, isoDate, todayIso } from './datetime';

beforeEach(() => i18nStore.set('en'));
afterEach(() => vi.useRealTimers());

describe('local dates', () => {
  it('uses the local calendar date, not UTC', () => {
    // 02:00 local on 25 Sep: UTC may still be 24 Sep, "today" must not be.
    const d = new Date(2026, 8, 25, 2, 0, 0);
    expect(isoDate(d)).toBe('2026-09-25');
    vi.useFakeTimers();
    vi.setSystemTime(d);
    expect(todayIso()).toBe('2026-09-25');
  });
});

describe('fmtLastSeen', () => {
  it('turns ISO timestamps into relative, readable text', () => {
    vi.useFakeTimers();
    const now = new Date(2026, 8, 25, 12, 0, 0);
    vi.setSystemTime(now);
    expect(fmtLastSeen(new Date(now.getTime() - 20_000))).toBe(t('time.justNow'));
    expect(fmtLastSeen(new Date(now.getTime() - 5 * 60_000).toISOString())).toBe(t('time.minutesAgo', { n: 5 }));
    expect(fmtLastSeen(new Date(2026, 8, 25, 8, 15))).toMatch(/^today /);
    expect(fmtLastSeen(new Date(2026, 8, 24, 8, 15))).toMatch(/^yesterday /);
  });

  it('returns null for missing or invalid values', () => {
    expect(fmtLastSeen(null)).toBeNull();
    expect(fmtLastSeen('not a date')).toBeNull();
  });
});
