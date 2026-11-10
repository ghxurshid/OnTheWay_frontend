import { describe, it, expect } from 'vitest';
import { ROUTE_MATCH_CORRIDOR_KM, bearing, haversineKm, osrmToLatLngs, projectOnRoute, routeLength, routeMatchPercent, splitRoute } from './geo';
import type { LatLng } from './geo';

describe('haversineKm', () => {
  it('is zero for identical points', () => {
    expect(haversineKm([41.31, 69.28], [41.31, 69.28])).toBe(0);
  });

  it('returns Infinity when a point is missing (defensive)', () => {
    expect(haversineKm(null, [41.31, 69.28])).toBe(Infinity);
    expect(haversineKm([41.31, 69.28], undefined)).toBe(Infinity);
  });

  it('is symmetric', () => {
    const a: LatLng = [41.31, 69.28];
    const b: LatLng = [41.35, 69.31];
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

describe('osrmToLatLngs', () => {
  it('swaps GeoJSON [lng,lat] into [lat,lng]', () => {
    expect(osrmToLatLngs([[69.2, 41.3], [69.3, 41.4]])).toEqual([[41.3, 69.2], [41.4, 69.3]]);
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

  it('gives the same answer with the legs supplied by the caller', () => {
    const point: LatLng = [0.0002, 1.3];
    const legs = [haversineKm(route[0], route[1]), haversineKm(route[1], route[2])];
    expect(projectOnRoute(route, point, legs)).toEqual(projectOnRoute(route, point));
  });
});

describe('routeMatchPercent', () => {
  // Routes are laid out in km on a local grid around Tashkent, so a test reads as a map.
  const LAT = 41.3;
  const KM_PER_DEG_LAT = 111.32;
  const KM_PER_DEG_LNG = KM_PER_DEG_LAT * Math.cos((LAT * Math.PI) / 180);
  const at = (eastKm: number, northKm = 0): LatLng => [LAT + northKm / KM_PER_DEG_LAT, 69.2 + eastKm / KM_PER_DEG_LNG];
  /** A line from km `from` to km `to` on the east axis (`to` < `from` drives west). */
  const eastward = (from: number, to: number, northKm = 0, legs = 20): LatLng[] =>
    Array.from({ length: legs + 1 }, (_, i) => at(from + ((to - from) * i) / legs, northKm));

  it('scores identical routes 100', () => {
    const route = eastward(0, 10);
    expect(routeMatchPercent(route, route)).toBe(100);
  });

  it('scores identical routes 100 whatever their vertices', () => {
    expect(routeMatchPercent(eastward(0, 10, 0, 1), eastward(0, 10, 0, 500))).toBe(100);
  });

  it('scores the same road in the opposite direction 0', () => {
    expect(routeMatchPercent(eastward(0, 10), eastward(10, 0))).toBe(0);
  });

  it('scores a short route against the direction of a long one 0', () => {
    expect(routeMatchPercent(eastward(25, 20), eastward(0, 50))).toBe(0);
    expect(routeMatchPercent(eastward(0, 50), eastward(25, 20))).toBe(0);
  });

  it('scores a partly opposite overlap 0', () => {
    expect(routeMatchPercent(eastward(0, 10), eastward(15, 5))).toBe(0);
  });

  it('scores a partial overlap by its share of the shorter trip', () => {
    const half = routeMatchPercent(eastward(0, 10), eastward(5, 15))!; // the last 5 of 10 km
    expect(half).toBeGreaterThanOrEqual(45);
    expect(half).toBeLessThanOrEqual(55);
    const quarter = routeMatchPercent(eastward(0, 20), eastward(15, 40))!; // the last 5 of 20 km
    expect(quarter).toBeGreaterThanOrEqual(20);
    expect(quarter).toBeLessThanOrEqual(30);
  });

  it('measures the overlap against the shorter trip, whichever way round', () => {
    const mine = eastward(0, 8); // all of it along...
    const theirs = eastward(-30, 8.1); // ...this much longer trip, which is mostly elsewhere
    expect(routeMatchPercent(mine, theirs)).toBe(100);
    expect(routeMatchPercent(theirs, mine)).toBe(100);
  });

  it('scores a short route inside a long one 100', () => {
    expect(routeMatchPercent(eastward(20, 25), eastward(0, 50))).toBe(100);
    expect(routeMatchPercent(eastward(0, 50), eastward(20, 25))).toBe(100);
  });

  it('scores routes with nothing in common 0', () => {
    expect(routeMatchPercent(eastward(0, 10), eastward(0, 10, 5))).toBe(0);
    expect(routeMatchPercent(eastward(0, 10), eastward(500, 510, 400))).toBe(0);
  });

  it('honours the corridor', () => {
    const inside = ROUTE_MATCH_CORRIDOR_KM - 0.05;
    const outside = ROUTE_MATCH_CORRIDOR_KM + 0.05;
    expect(routeMatchPercent(eastward(0, 10), eastward(0, 10, inside))).toBe(100);
    expect(routeMatchPercent(eastward(0, 10), eastward(0, 10, outside))).toBe(0);
  });

  it('scores a route that only crosses the other 0, however short', () => {
    const northward = (fromKm: number, toKm: number): LatLng[] => [at(25, fromKm), at(25, toKm)];
    const road = eastward(0, 50);
    expect(routeMatchPercent(northward(-5, 5), road)).toBe(0);
    expect(routeMatchPercent(northward(-0.2, 0.2), road)).toBe(0); // wholly inside the corridor
  });

  it('does not count a route running past the end of the other', () => {
    expect(routeMatchPercent(eastward(10, 10.25), eastward(0, 10))).toBe(0);
  });

  it('samples by distance: a dense stretch of polyline weighs no more than a sparse one', () => {
    const denseThenAway = [...eastward(0, 5, 0, 1000), at(10, 5)]; // half on the road, half off
    const score = routeMatchPercent(denseThenAway, eastward(0, 20))!;
    expect(score).toBeGreaterThanOrEqual(40);
    expect(score).toBeLessThanOrEqual(65);
  });

  it('survives a stray projection onto a later part of the other route', () => {
    // Their route later comes back to within metres of mine, closer than its first pass
    // (12 m away): my sample at km 4 snaps far ahead, and the samples after it snap back.
    const theirs = [...eastward(0, 10), at(10, 3), at(4, 3), at(4, 0.01), at(4, 3), at(10, 3)];
    expect(routeMatchPercent(eastward(0, 8, 0.012), theirs)).toBeGreaterThanOrEqual(90);
  });

  it('returns null when a route has fewer than 2 points', () => {
    const route = eastward(0, 10);
    expect(routeMatchPercent([], route)).toBeNull();
    expect(routeMatchPercent(route, [])).toBeNull();
    expect(routeMatchPercent([at(0)], route)).toBeNull();
    expect(routeMatchPercent(route, [at(0)])).toBeNull();
  });

  it('returns null when a route has no length', () => {
    expect(routeMatchPercent([at(0), at(0)], eastward(0, 10))).toBeNull();
    expect(routeMatchPercent(eastward(0, 10), [at(3), at(3), at(3)])).toBeNull();
  });

  it('always returns an integer between 0 and 100', () => {
    const score = routeMatchPercent(eastward(0, 13), eastward(7.3, 40))!;
    expect(Number.isInteger(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
