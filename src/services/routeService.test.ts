import { describe, it, expect, vi } from 'vitest';
import { MAX_SHARED_ROUTE_POINTS, shareableRoute, toRoutePublishDto } from './routeService';
import { projectOnRoute } from '@/utils/geo';
import type { LatLng } from '@/utils/geo';

vi.mock('@/api/geoApi', () => ({ geoApi: { route: vi.fn() } }));

const COORDS: LatLng[] = [[41.28, 69.2], [41.3, 69.25], [41.33, 69.28]];
const ROUTE = { distance: 8400, duration: 1260 };

describe('toRoutePublishDto', () => {
  it('shares the picked places as the route ends\' labels', () => {
    expect(toRoutePublishDto(COORDS, ROUTE, { from: "Kichik Halqa yo'li, Chilonzor Tumani", to: 'Amir Temur, Yunusobod Tumani' })).toEqual({
      origin: { lat: 41.28, lng: 69.2 },
      originLabel: "Kichik Halqa yo'li, Chilonzor Tumani",
      destination: { lat: 41.33, lng: 69.28 },
      destinationLabel: 'Amir Temur, Yunusobod Tumani',
      points: [{ lat: 41.28, lng: 69.2 }, { lat: 41.3, lng: 69.25 }, { lat: 41.33, lng: 69.28 }],
      distanceKm: 8.4,
      etaMinutes: 21,
    });
  });

  it('a blank or missing label is sent as null (the watcher geocodes the point)', () => {
    const dto = toRoutePublishDto(COORDS, ROUTE, { from: '   ', to: undefined });
    expect(dto.originLabel).toBeNull();
    expect(dto.destinationLabel).toBeNull();
    expect(toRoutePublishDto(COORDS, ROUTE)).toMatchObject({ originLabel: null, destinationLabel: null });
  });

  it('trims a label', () => {
    expect(toRoutePublishDto(COORDS, ROUTE, { from: ' Chorsu ', to: 'Yunusobod ' })).toMatchObject({ originLabel: 'Chorsu', destinationLabel: 'Yunusobod' });
  });

  it('without OSRM figures sends no distance or ETA', () => {
    expect(toRoutePublishDto(COORDS, null)).toMatchObject({ distanceKm: null, etaMinutes: null });
  });
});

/** ~280 km Tashkent → Samarkand as OSRM would draw it: 5,000 points, 100 bends of
    ±1 km, and ±3 m of jitter between them. */
const intercity = (): LatLng[] => Array.from({ length: 5000 }, (_, i) => {
  const s = i / 4999;
  const phase = (i % 100) / 100;
  const bend = phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase; // -1 … 1
  const metres = 1000 * bend + 3 * Math.sin(i * 12.9898);
  return [41.3 + (39.65 - 41.3) * s + metres / 111320, 69.2 + (66.96 - 69.2) * s];
});

describe('shareableRoute', () => {
  it('thins an inter-city route under the cap, every dropped point within ~10 m of what is shared', () => {
    const route = intercity();
    const shared = shareableRoute(route);
    expect(shared.length).toBeLessThanOrEqual(MAX_SHARED_ROUTE_POINTS);
    expect(shared[0]).toEqual(route[0]);
    expect(shared[shared.length - 1]).toEqual(route[route.length - 1]);
    for (let i = 0; i < route.length; i += 7) {
      expect(projectOnRoute(shared, route[i]).offRouteKm * 1000).toBeLessThan(11);
    }
  });

  it('caps a route that will not simplify, keeping both ends', () => {
    // 2,500 bends of ±1 km: every point is far off any chord, so only the budget stops it.
    const zigzag: LatLng[] = Array.from({ length: 5000 }, (_, i) => [41.3 + (i % 2 ? 0.009 : -0.009), 69.2 - i * 0.0004]);
    const shared = shareableRoute(zigzag);
    expect(shared).toHaveLength(MAX_SHARED_ROUTE_POINTS);
    expect(shared[0]).toEqual(zigzag[0]);
    expect(shared[shared.length - 1]).toEqual(zigzag[zigzag.length - 1]);
    expect(JSON.stringify(toRoutePublishDto(zigzag, null)).length).toBeLessThan(16 * 1024);
  });

  it('keeps the big detours of a long route under the cap (worst-first, not evenly spaced)', () => {
    // ~84 km west, 2,000 small ±30 m wiggles, and three out-and-back spurs of 2 km that
    // an evenly spaced thinning could skip entirely.
    const detoured: LatLng[] = Array.from({ length: 10000 }, (_, i) => {
      const wiggle = Math.floor(i / 5) % 2 ? 30 : -30;
      const spurStart = [3000, 6000, 9000].find((s) => i >= s && i < s + 30);
      const spur = spurStart === undefined ? 0 : 2000 * (1 - Math.abs(i - spurStart - 14.5) / 14.5);
      return [41.3 + (wiggle + spur) / 111320, 69.2 - i * 0.0001];
    });
    const shared = shareableRoute(detoured);
    expect(shared.length).toBeLessThanOrEqual(MAX_SHARED_ROUTE_POINTS);
    let worstM = 0;
    for (const point of detoured) worstM = Math.max(worstM, projectOnRoute(shared, point).offRouteKm * 1000);
    expect(worstM).toBeLessThan(100);
  });

  it('collapses a straight line to its ends', () => {
    const line: LatLng[] = Array.from({ length: 1000 }, (_, i) => [41.3, 69.2 + i * 0.0001]);
    expect(shareableRoute(line)).toEqual([line[0], line[999]]);
  });

  it('keeps the published payload well under the hub message limit', () => {
    const route = intercity();
    const dto = toRoutePublishDto(route, { distance: 280000, duration: 14400 }, { from: 'Toshkent', to: 'Samarqand' });
    // The drawn route's ends, at 6 decimals (~0.1 m).
    expect(dto.origin.lat).toBeCloseTo(route[0][0], 6);
    expect(dto.origin.lng).toBeCloseTo(route[0][1], 6);
    expect(dto.destination.lat).toBeCloseTo(route[4999][0], 6);
    expect(dto.destination.lng).toBeCloseTo(route[4999][1], 6);
    expect(JSON.stringify(dto).length).toBeLessThan(16 * 1024);
  });
});
