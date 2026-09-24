/* ════════════════════════════════════════════════════════════════
   SERVICE — routing + the "RouteServer" cache.
   `getRoute` returns OSRM route alternatives. `RouteServer` models a
   backend that computes a walker's route once, caches it by id, and serves
   it on subsequent requests (the prototype's mock server behaviour).
   ════════════════════════════════════════════════════════════════ */

import { geoApi } from '@/api/geoApi';
import { haversineKm, osrmToLatLngs, sleep } from '@/utils/geo';
import type { LatLng } from '@/utils/geo';
import type { RouteData } from '@/models';

/** One OSRM route alternative (distance in metres, duration in seconds). */
export interface OsrmRoute {
  geometry?: { coordinates: [number, number][] };
  distance: number;
  duration: number;
}

/** OSRM driving routes through ordered [lat,lng] coords (best first). */
export function getRoute(coords: LatLng[], options?: { alternatives?: boolean }): Promise<OsrmRoute[]> {
  return geoApi.route(coords, options) as Promise<OsrmRoute[]>;
}

/** The route's polyline as [lat,lng] points (empty when OSRM sent none). */
export const routeCoords = (route: OsrmRoute): LatLng[] =>
  route.geometry ? osrmToLatLngs(route.geometry.coordinates) : [];

/** A drawn route → the PresenceHub RoutePublishDto shared with watchers. */
export function toRoutePublishDto(coords: LatLng[], route: Partial<OsrmRoute> | null) {
  const points = coords.map(([lat, lng]) => ({ lat, lng }));
  return {
    origin: points[0],
    originLabel: null,
    destination: points[points.length - 1],
    points,
    distanceKm: route?.distance ? route.distance / 1000 : null,
    etaMinutes: route?.duration ? Math.round(route.duration / 60) : null,
  };
}

// Build a single normalized route between two points, falling back to a
// straight line when OSRM is unavailable.
async function build(from: LatLng, to: LatLng): Promise<RouteData> {
  const [r] = await getRoute([from, to]);
  if (r?.geometry) {
    return { coords: routeCoords(r), distanceKm: r.distance / 1000, durationMin: r.duration / 60 };
  }
  const km = haversineKm(from, to);
  return { coords: [from, to], distanceKm: km, durationMin: km / 0.4 };
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
