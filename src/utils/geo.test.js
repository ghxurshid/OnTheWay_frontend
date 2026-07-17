import { describe, it, expect } from 'vitest';
import { haversineKm } from './geo';

describe('haversineKm', () => {
  it('is zero for identical points', () => {
    expect(haversineKm([41.31, 69.28], [41.31, 69.28])).toBe(0);
  });

  it('returns Infinity when a point is missing (defensive)', () => {
    expect(haversineKm(null, [41.31, 69.28])).toBe(Infinity);
    expect(haversineKm([41.31, 69.28], undefined)).toBe(Infinity);
  });

  it('is symmetric', () => {
    const a = [41.31, 69.28];
    const b = [41.35, 69.31];
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
  });

  it('matches a known great-circle distance (~1° lat ≈ 111 km)', () => {
    const d = haversineKm([0, 0], [1, 0]);
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  it('grows monotonically with separation', () => {
    const near = haversineKm([41.31, 69.28], [41.32, 69.28]);
    const far = haversineKm([41.31, 69.28], [41.40, 69.28]);
    expect(far).toBeGreaterThan(near);
  });
});
