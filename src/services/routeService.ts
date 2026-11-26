/* ════════════════════════════════════════════════════════════════
   SERVICE — routing + the "RouteServer" cache.
   `getRoute` returns OSRM route alternatives. `RouteServer` models a
   backend that computes a walker's route once, caches it by id, and serves
   it on subsequent requests (the prototype's mock server behaviour).
   ════════════════════════════════════════════════════════════════ */

import { geoApi } from '@/api/geoApi';
import { haversineKm, osrmToLatLngs, simplifyPolylineToBudget, sleep } from '@/utils/geo';
import type { LatLng } from '@/utils/geo';
import type { RouteData } from '@/models';

/** One OSRM route alternative (distance in metres, duration in seconds). */
export interface OsrmRoute {
  geometry?: { coordinates: [number, number][] };
  distance: number;
  duration: number;
}

/** OSRM driving routes through ordered [lat,lng] coords (best first); empty
    when no road connects them. Throws (ApiError) when the service fails. */
export function getRoute(coords: LatLng[], options?: { alternatives?: boolean }): Promise<OsrmRoute[]> {
  return geoApi.route(coords, options) as Promise<OsrmRoute[]>;
}

/** The route's polyline as [lat,lng] points (empty when OSRM sent none). */
export const routeCoords = (route: OsrmRoute): LatLng[] =>
  route.geometry ? osrmToLatLngs(route.geometry.coordinates) : [];

/** Where a route starts and ends, as the user picked them in the route sheet. */
export interface RouteEndLabels { from?: string | null; to?: string | null }

/** A label worth sharing: trimmed and not blank. */
const shareable = (label: string | null | undefined): string | null => label?.trim() || null;

/** At most this many points of a route are shared. It goes to every watcher over
    SignalR (~35 bytes a point at 6 decimals, so ~14 KB — inside even the default
    32 KB message limit), and the presence hub refuses a route of more than 500
    points: an inter-city OSRM geometry (10,000+ points) used to close the
    connection on every replay. */
export const MAX_SHARED_ROUTE_POINTS = 400;
/** Below this a dropped point is invisible next to the 300 m "on the way" corridor
    of the route match, so simplification stops there even with budget left. */
const SHARED_ROUTE_TOLERANCE_M = 10;

/** ~0.1 m: as precise as OSRM's own geometry, and it bounds each point's size. */
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/** The route as it is shared with watchers: at most MAX_SHARED_ROUTE_POINTS points,
    refined worst-first so its big bends survive, its two ends exactly as drawn. The
    own route on the map keeps every point; only what goes over the wire is thinned. */
export const shareableRoute = (coords: LatLng[]): LatLng[] =>
  simplifyPolylineToBudget(coords, MAX_SHARED_ROUTE_POINTS, SHARED_ROUTE_TOLERANCE_M);

/** A drawn route → the PresenceHub RoutePublishDto shared with watchers. The
    picked places' labels go along, so a watcher's card can say where the
    person is heading without reverse-geocoding the ends. The points are the
    shareable (thinned) route; its ends are the drawn route's ends. */
export function toRoutePublishDto(coords: LatLng[], route: Partial<OsrmRoute> | null, labels?: RouteEndLabels | null) {
  const points = shareableRoute(coords).map(([lat, lng]) => ({ lat: round6(lat), lng: round6(lng) }));
  return {
    origin: points[0],
    originLabel: shareable(labels?.from),
    destination: points[points.length - 1],
    destinationLabel: shareable(labels?.to),
    points,
    distanceKm: route?.distance ? route.distance / 1000 : null,
    etaMinutes: route?.duration ? Math.round(route.duration / 60) : null,
  };
}

// Build a single normalized route between two points, falling back to a
// straight line when the routing service is unavailable.
async function build(from: LatLng, to: LatLng): Promise<RouteData> {
  const [r] = await getRoute([from, to]).catch((): OsrmRoute[] => []);
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
