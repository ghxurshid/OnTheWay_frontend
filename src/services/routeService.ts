/* ════════════════════════════════════════════════════════════════
   SERVICE — routing + the "RouteServer" cache.
   `getRoute` returns OSRM route alternatives. `RouteServer` models a
   backend that computes a walker's route once, caches it by id, and serves
   it on subsequent requests (the prototype's mock server behaviour).
   ════════════════════════════════════════════════════════════════ */

import { geoApi } from '@/api/geoApi';
import { haversineKm, sleep } from '@/utils/geo';
import type { LatLng } from '@/utils/geo';
import type { RouteData } from '@/models';

interface OsrmRoute {
  geometry?: { coordinates: [number, number][] };
  distance: number;
  duration: number;
}

/** OSRM driving routes through ordered [lat,lng] coords. */
export function getRoute(coords: LatLng[]) {
  return geoApi.route(coords);
}

// Build a single normalized route between two points, falling back to a
// straight line when OSRM is unavailable.
async function build(from: LatLng, to: LatLng): Promise<RouteData> {
  const routes = await getRoute([from, to]) as OsrmRoute[];
  const r = routes && routes[0];
  if (r && r.geometry) {
    return {
      coords: r.geometry.coordinates.map((c) => [c[1], c[0]] as LatLng),
      distanceKm: r.distance / 1000,
      durationMin: r.duration / 60,
    };
  }
  return { coords: [from, to], distanceKm: haversineKm(from, to), durationMin: haversineKm(from, to) / 0.4 };
}

const cache = new Map<string, RouteData>(); // walkerId → route

interface RoutableWalker { id: string; fromLatlng: LatLng; toLatlng: LatLng }

export const RouteServer = {
  /** Persist a route once when a walker submits a trip. */
  async save(id: string, from: LatLng, to: LatLng): Promise<RouteData | undefined> {
    if (!cache.has(id)) cache.set(id, await build(from, to));
    return cache.get(id);
  },
  /** Load a walker/contact's route — served from cache when available. */
  async fetch(walker: RoutableWalker): Promise<RouteData> {
    const cached = cache.get(walker.id);
    if (cached) { await sleep(260); return cached; }
    const data = await build(walker.fromLatlng, walker.toLatlng);
    cache.set(walker.id, data);
    return data;
  },
};
