import { describe, it, expect } from 'vitest';
import { zoomForSpeed, DEFAULT_HEADING } from './useHeadingFollow';

describe('zoomForSpeed', () => {
  it('defaults to the closest zoom when speed is unknown', () => {
    expect(zoomForSpeed(null)).toBe(17);
    expect(zoomForSpeed(NaN)).toBe(17);
  });

  it('zooms out further the faster you go', () => {
    expect(zoomForSpeed(0)).toBe(17);   // stationary
    expect(zoomForSpeed(10)).toBe(16);  // slow
    expect(zoomForSpeed(30)).toBe(15);  // city
    expect(zoomForSpeed(80)).toBe(14);  // fast
  });

  it('is monotonically non-increasing in speed', () => {
    const speeds = [0, 4, 5, 19, 20, 44, 45, 120];
    const zooms = speeds.map(zoomForSpeed);
    for (let i = 1; i < zooms.length; i++) {
      expect(zooms[i]).toBeLessThanOrEqual(zooms[i - 1]);
    }
  });

  it('exposes a north-up default heading', () => {
    expect(DEFAULT_HEADING).toBe(0);
  });
});
