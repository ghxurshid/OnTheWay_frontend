import { describe, it, expect } from 'vitest';
import { summaryPath } from './dashboardApi';

describe('GET /dashboard/summary path', () => {
  it('sends the offset in minutes east of UTC', () => {
    expect(summaryPath(300)).toBe('/dashboard/summary?tzOffsetMinutes=300');
    expect(summaryPath(-240)).toBe('/dashboard/summary?tzOffsetMinutes=-240');
    expect(summaryPath(0)).toBe('/dashboard/summary?tzOffsetMinutes=0');
  });

  it('defaults to the device offset (local = UTC + offset)', () => {
    expect(summaryPath()).toBe(`/dashboard/summary?tzOffsetMinutes=${-new Date().getTimezoneOffset()}`);
  });
});
