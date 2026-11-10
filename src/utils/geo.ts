/* Geographic helpers — pure functions, no framework dependencies. Shared by the
   live navigation (real GPS), the heading follow mode and the demo simulation. */

/** A geographic point as [latitude, longitude]. */
export type LatLng = [number, number];

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Great-circle distance between two [lat,lng] points, in kilometres
    (Infinity when a point is missing, so it sorts last). */
export const haversineKm = (a?: LatLng | null, b?: LatLng | null): number => {
  if (!a || !b) return Infinity;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
};

/** Bearing (deg, clockwise from north) from a → b; 0 when a point is missing. */
export function bearing(a?: LatLng | null, b?: LatLng | null): number {
  if (!a || !b) return 0;
  const dLon = toRad(b[1] - a[1]);
  const y = Math.sin(dLon) * Math.cos(toRad(b[0]));
  const x = Math.cos(toRad(a[0])) * Math.sin(toRad(b[0])) - Math.sin(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** OSRM/GeoJSON [lng,lat] coordinates → Leaflet [lat,lng] points. */
export const osrmToLatLngs = (coordinates: number[][]): LatLng[] => coordinates.map(([lng, lat]) => [lat, lng]);

/** Length of each leg of a polyline, in km. */
const legLengths = (route: LatLng[]): number[] => route.slice(1).map((p, i) => haversineKm(route[i], p));

/** Total polyline length in km. */
export const routeLength = (route: LatLng[]): number => legLengths(route).reduce((s, d) => s + d, 0);

export interface SplitResult { position: LatLng | null; traveled: LatLng[]; remaining: LatLng[] }

/** Split a route at progress (0..1) into traveled / remaining + position. */
export function splitRoute(route: LatLng[], progress: number): SplitResult {
  if (!route || route.length < 2) {
    return { position: route ? route[0] : null, traveled: [], remaining: route || [] };
  }
  const legs = legLengths(route);
  const target = Math.max(0, Math.min(1, progress)) * legs.reduce((s, d) => s + d, 0);
  let acc = 0;
  let idx = 0;
  for (; idx < legs.length; idx++) {
    if (acc + legs[idx] >= target) break;
    acc += legs[idx];
  }
  if (idx >= legs.length) {
    const last = route[route.length - 1];
    return { position: last, traveled: route.slice(), remaining: [last] };
  }
  const frac = legs[idx] === 0 ? 0 : (target - acc) / legs[idx];
  const [a, b] = [route[idx], route[idx + 1]];
  const pos: LatLng = [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
  return { position: pos, traveled: [...route.slice(0, idx + 1), pos], remaining: [pos, ...route.slice(idx + 1)] };
}

export interface ProjectResult { progress: number; position: LatLng | null; offRouteKm: number }

/** Project a real [lat,lng] point onto the route polyline (local planar approximation).
    `legs` are the route's leg lengths, for a caller projecting many points onto one route. */
export function projectOnRoute(route: LatLng[], point: LatLng, legs: number[] = legLengths(route ?? [])): ProjectResult {
  if (!route || route.length < 2 || !point) {
    return { progress: 0, position: route ? route[0] : point, offRouteKm: 0 };
  }
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(toRad(point[0]));
  const toXY = (p: LatLng): [number, number] => [(p[1] - point[1]) * mPerDegLng, (p[0] - point[0]) * mPerDegLat];

  let best = { d2: Infinity, seg: 0, t: 0 };
  for (let i = 1; i < route.length; i++) {
    const a = toXY(route[i - 1]);
    const b = toXY(route[i]);
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const len2 = abx * abx + aby * aby;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(a[0] * abx + a[1] * aby) / len2));
    const px = a[0] + abx * t;
    const py = a[1] + aby * t;
    const d2 = px * px + py * py;
    if (d2 < best.d2) best = { d2, seg: i - 1, t };
  }

  const total = legs.reduce((s, d) => s + d, 0);
  const along = legs.slice(0, best.seg).reduce((s, d) => s + d, 0) + legs[best.seg] * best.t;
  const [a, b] = [route[best.seg], route[best.seg + 1]];
  return {
    progress: total === 0 ? 0 : along / total,
    position: [a[0] + (b[0] - a[0]) * best.t, a[1] + (b[1] - a[1]) * best.t],
    offRouteKm: Math.sqrt(best.d2) / 1000,
  };
}

/** How far from the other route a point may lie and still be "on the way", in km.
    Ride-matching products describe this as a short walk to the route ("a few blocks",
    "a few minutes") without publishing a figure; 300 m is about four minutes on foot
    and also absorbs the gap between a road's two sides or a neighbouring street. */
export const ROUTE_MATCH_CORRIDOR_KM = 0.3;

/** Samples along the shorter route (40 equal steps). The cap on the match's cost:
    it does not grow with a polyline's density. */
const ROUTE_MATCH_SAMPLES = 41;

/** Between two samples the other route must advance by at least this share of the
    distance travelled, i.e. the trips head within about 60° of each other. Keeps a
    route that merely crosses the other one from counting as running along it. */
const ROUTE_MATCH_MIN_ADVANCE = 0.5;

/** `count` points spaced evenly BY DISTANCE along a polyline, both ends included. */
function sampleAlong(route: LatLng[], legs: number[], totalKm: number, count: number): LatLng[] {
  const samples: LatLng[] = [];
  let leg = 0;
  let passed = 0; // km from the start to the beginning of `leg`
  for (let i = 0; i < count; i++) {
    const target = (totalKm * i) / (count - 1);
    while (leg < legs.length - 1 && passed + legs[leg] < target) passed += legs[leg++];
    const frac = legs[leg] === 0 ? 0 : Math.min(1, (target - passed) / legs[leg]);
    const [a, b] = [route[leg], route[leg + 1]];
    samples.push([a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac]);
  }
  return samples;
}

/** Test for "may be within `km` of this polyline": its bounding box, grown by `km`. */
function nearBox(route: LatLng[], km: number): (p: LatLng) => boolean {
  let [south, north, west, east] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const [lat, lng] of route) { // a loop: a long polyline would overflow Math.min(...lats)
    if (lat < south) south = lat;
    if (lat > north) north = lat;
    if (lng < west) west = lng;
    if (lng > east) east = lng;
  }
  const dLat = km / 111.32;
  const dLng = dLat / Math.max(0.01, Math.cos(toRad(Math.max(Math.abs(south), Math.abs(north)))));
  return (p) => p[0] >= south - dLat && p[0] <= north + dLat && p[1] >= west - dLng && p[1] <= east + dLng;
}

/** How much of the shorter of two trips runs along the other, in the same direction:
    an integer 0–100, or null when a route has no length to compare.

    The shorter route is sampled by distance, so a dense stretch of polyline weighs no
    more than a sparse one. Samples inside the corridor are projected onto the other
    route, and only the longest chain of them that keeps moving forward along it counts:
    the same road driven the opposite way projects backwards and scores 0. */
export function routeMatchPercent(mine: LatLng[], theirs: LatLng[]): number | null {
  if (!mine || !theirs || mine.length < 2 || theirs.length < 2) return null;
  const [mineLegs, theirLegs] = [legLengths(mine), legLengths(theirs)];
  const [mineKm, theirKm] = [mineLegs, theirLegs].map((legs) => legs.reduce((s, d) => s + d, 0));
  if (!(mineKm > 0) || !(theirKm > 0)) return null;

  const mineIsShorter = mineKm <= theirKm;
  const samples = mineIsShorter
    ? sampleAlong(mine, mineLegs, mineKm, ROUTE_MATCH_SAMPLES)
    : sampleAlong(theirs, theirLegs, theirKm, ROUTE_MATCH_SAMPLES);
  const [other, otherLegs, otherKm] = mineIsShorter ? [theirs, theirLegs, theirKm] : [mine, mineLegs, mineKm];
  const stepKm = Math.min(mineKm, theirKm) / (ROUTE_MATCH_SAMPLES - 1);

  // Where each sample inside the corridor lands on the other route, in travel order.
  const isNear = nearBox(other, ROUTE_MATCH_CORRIDOR_KM);
  const hits: { at: number; alongKm: number }[] = [];
  samples.forEach((sample, at) => {
    if (!isNear(sample)) return;
    const { progress, offRouteKm } = projectOnRoute(other, sample, otherLegs);
    if (offRouteKm <= ROUTE_MATCH_CORRIDOR_KM) hits.push({ at, alongKm: progress * otherKm });
  });

  // Longest forward chain: tolerates a stray projection (a route passing near itself)
  // where a simple "never go backwards" scan would lose everything after it.
  const chain: number[] = [];
  let longest = 0;
  hits.forEach((hit, j) => {
    chain[j] = 1;
    for (let i = 0; i < j; i++) {
      const needKm = (hit.at - hits[i].at) * stepKm * ROUTE_MATCH_MIN_ADVANCE;
      if (hit.alongKm - hits[i].alongKm >= needKm && chain[i] + 1 > chain[j]) chain[j] = chain[i] + 1;
    }
    if (chain[j] > longest) longest = chain[j];
  });
  // N samples in a chain span N-1 steps of the shorter trip; a lone sample spans none.
  return longest < 2 ? 0 : Math.round((100 * (longest - 1)) / (ROUTE_MATCH_SAMPLES - 1));
}
