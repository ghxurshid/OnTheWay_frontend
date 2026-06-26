/* ════════════════════════════════════════════════════════════════
   SERVICE — routing + the "RouteServer" cache.
   `getRoute` returns OSRM route alternatives. `RouteServer` models a
   backend that computes a walker's route once, caches it by id, and serves
   it on subsequent requests (the prototype's mock server behaviour).
   ════════════════════════════════════════════════════════════════ */

import { geoApi } from '@/api/geoApi';
import { haversineKm, sleep } from '@/utils/geo';

/** OSRM driving routes through ordered [lat,lng] coords. */
export function getRoute(coords) {
  return geoApi.route(coords);
}

// Build a single normalized route ({coords, distanceKm, durationMin}) between
// two points, falling back to a straight line when OSRM is unavailable.
async function build(from, to) {
  const routes = await getRoute([from, to]);
  const r = routes && routes[0];
  if (r && r.geometry) {
    return {
      coords: r.geometry.coordinates.map((c) => [c[1], c[0]]),
      distanceKm: r.distance / 1000,
      durationMin: r.duration / 60,
    };
  }
  return { coords: [from, to], distanceKm: haversineKm(from, to), durationMin: haversineKm(from, to) / 0.4 };
}

const cache = new Map(); // walkerId → { coords, distanceKm, durationMin }

export const RouteServer = {
  /** Persist a route once when a walker submits a trip. */
  async save(id, from, to) {
    if (!cache.has(id)) cache.set(id, await build(from, to));
    return cache.get(id);
  },
  /** Load a walker/contact's route — served from cache when available. */
  async fetch(walker) {
    if (cache.has(walker.id)) { await sleep(260); return cache.get(walker.id); }
    const data = await build(walker.fromLatlng, walker.toLatlng);
    cache.set(walker.id, data);
    return data;
  },
};
