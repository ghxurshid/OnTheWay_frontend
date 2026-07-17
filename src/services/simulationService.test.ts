import { describe, it, expect } from 'vitest';
import { bearing, splitRoute, routeLength, projectOnRoute } from './simulationService';
import type { LatLng } from '@/utils/geo';

describe('bearing', () => {
  it('points north (0°) when moving due north', () => {
    expect(bearing([0, 0], [1, 0])).toBeCloseTo(0, 1);
  });

  it('points east (90°) when moving due east', () => {
    expect(bearing([0, 0], [0, 1])).toBeCloseTo(90, 1);
  });

  it('points south (180°) when moving due south', () => {
    expect(bearing([1, 0], [0, 0])).toBeCloseTo(180, 1);
  });

  it('always returns a value in [0, 360)', () => {
    const b = bearing([0, 0], [-1, -1]);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });

  it('is 0 (safe default) for missing input', () => {
    expect(bearing(null, [1, 1])).toBe(0);
  });
});

describe('splitRoute', () => {
  const route: LatLng[] = [[0, 0], [0, 1], [0, 2]]; // straight line east, two equal legs

  it('at progress 0 nothing is traveled and position is the start', () => {
    const s = splitRoute(route, 0);
    expect(s.position).toEqual([0, 0]);
    expect(s.traveled.length).toBeLessThanOrEqual(2);
    expect(s.remaining[0]).toEqual([0, 0]);
  });

  it('at progress 1 everything is traveled and position is the end', () => {
    const s = splitRoute(route, 1);
    expect(s.position).toEqual([0, 2]);
    // remaining collapses onto the end point (its last vertex is the destination)
    expect(s.remaining[s.remaining.length - 1]).toEqual([0, 2]);
    expect(s.traveled[s.traveled.length - 1]).toEqual([0, 2]);
  });

  it('at progress 0.5 the position sits at the midpoint', () => {
    const s = splitRoute(route, 0.5);
    expect(s.position![1]).toBeCloseTo(1, 5);
  });

  it('clamps out-of-range progress', () => {
    expect(splitRoute(route, -1).position).toEqual([0, 0]);
    expect(splitRoute(route, 5).position).toEqual([0, 2]);
  });

  it('degrades gracefully for a degenerate route', () => {
    const s = splitRoute([[0, 0]], 0.5);
    expect(s.position).toEqual([0, 0]);
    expect(s.traveled).toEqual([]);
  });
});

describe('routeLength', () => {
  it('sums the leg distances', () => {
    const oneLeg = routeLength([[0, 0], [0, 1]]);
    const twoLegs = routeLength([[0, 0], [0, 1], [0, 2]]);
    expect(twoLegs).toBeCloseTo(oneLeg * 2, 4);
  });
});

describe('projectOnRoute', () => {
  const route: LatLng[] = [[0, 0], [0, 1], [0, 2]];

  it('projects a point near the route back onto it with ~half progress', () => {
    const { progress, offRouteKm } = projectOnRoute(route, [0.0001, 1]);
    expect(progress).toBeGreaterThan(0.4);
    expect(progress).toBeLessThan(0.6);
    expect(offRouteKm).toBeGreaterThanOrEqual(0);
  });

  it('is safe with a degenerate route', () => {
    const r = projectOnRoute([[0, 0]], [1, 1]);
    expect(r.progress).toBe(0);
  });
});
