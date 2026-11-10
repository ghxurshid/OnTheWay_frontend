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

/** Project a real [lat,lng] point onto the route polyline (local planar approximation). */
export function projectOnRoute(route: LatLng[], point: LatLng): ProjectResult {
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

  const legs = legLengths(route);
  const total = legs.reduce((s, d) => s + d, 0);
  const along = legs.slice(0, best.seg).reduce((s, d) => s + d, 0) + legs[best.seg] * best.t;
  const [a, b] = [route[best.seg], route[best.seg + 1]];
  return {
    progress: total === 0 ? 0 : along / total,
    position: [a[0] + (b[0] - a[0]) * best.t, a[1] + (b[1] - a[1]) * best.t],
    offRouteKm: Math.sqrt(best.d2) / 1000,
  };
}
