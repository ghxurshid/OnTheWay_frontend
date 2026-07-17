/* ════════════════════════════════════════════════════════════════
   SERVICE — WALKER SIMULATION ENGINE
   Pure simulation logic, decoupled from Leaflet/React (geometry + data
   only). The map layer renders whatever this produces.
   ════════════════════════════════════════════════════════════════ */

import type { LatLng } from '@/utils/geo';

const TASHKENT: LatLng = [41.2995, 69.2401];
const KM_PER_DEG = 111;

const rand = (min: number, max: number): number => min + Math.random() * (max - min);
const randInt = (min: number, max: number): number => Math.floor(rand(min, max + 1));
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function haversine(a?: LatLng | null, b?: LatLng | null): number {
  if (!a || !b) return 0;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b[0] - a[0]);
  const dLng = toR(b[1] - a[1]);
  const la1 = toR(a[0]);
  const la2 = toR(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Bearing (deg, clockwise from north) from a → b. */
export function bearing(a?: LatLng | null, b?: LatLng | null): number {
  if (!a || !b) return 0;
  const toR = (d: number) => (d * Math.PI) / 180;
  const toD = (r: number) => (r * 180) / Math.PI;
  const dLon = toR(b[1] - a[1]);
  const y = Math.sin(dLon) * Math.cos(toR(b[0]));
  const x = Math.cos(toR(a[0])) * Math.sin(toR(b[0])) - Math.sin(toR(a[0])) * Math.cos(toR(b[0])) * Math.cos(dLon);
  return (toD(Math.atan2(y, x)) + 360) % 360;
}

export function randomPoint(center: LatLng, radiusKm: number): LatLng {
  const r = radiusKm / KM_PER_DEG;
  const u = Math.random();
  const v = Math.random();
  const w = r * Math.sqrt(u);
  const tt = 2 * Math.PI * v;
  const lat = center[0] + w * Math.cos(tt);
  const lng = center[1] + (w * Math.sin(tt)) / Math.cos((center[0] * Math.PI) / 180);
  return [lat, lng];
}

export function randomUserLocation(): LatLng {
  return randomPoint(TASHKENT, rand(0.5, 3.2));
}

const NAMES = [
  'Aziz Karimov', 'Jasur Umarov', 'Bobur Toshmatov', 'Sardor Aliyev',
  'Akmal Yusupov', 'Davron Qodirov', "Ulug'bek Rashidov", 'Sherzod Ismoilov',
  'Rustam Bekov', 'Otabek Nazarov', 'Farhod Soliyev', 'Jamshid Ergashev',
  'Malika Saidova', 'Dilnoza Nazarova', "Nigora Yo'ldosheva", 'Kamola Abdullayeva',
  'Sevara Tosheva', 'Gulnora Sharipova', 'Madina Olimova', 'Zarina Hakimova',
];
const VEHICLES = [
  'Chevrolet Nexia', 'Toyota Camry', 'Hyundai Accent', 'Chevrolet Cobalt',
  'Chevrolet Lacetti', 'Kia K5', 'Chevrolet Malibu', 'Daewoo Matiz',
  'Chevrolet Spark', 'Hyundai Sonata',
];
const PALETTE = [
  '#1fc8c0', '#f0a832', '#a78bfa', '#ff5c72', '#2ecc8e',
  '#4d9fff', '#ff8a4d', '#e85ad6', '#5fd0e0', '#ffd24d',
];

function initialsOf(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

/** A simulated walker with a precomputed route. */
export interface SimWalker {
  id: string;
  type: 'driver' | 'passenger';
  name: string;
  initials: string;
  vehicle: string | null;
  seats: number;
  color: string;
  route: LatLng[];
  lenKm: number;
  start: LatLng;
  dest: LatLng;
  progress: number;
  speed: number;
  rating: number;
  trips: number;
  match?: number;
  position?: LatLng | null;
  _traveled?: LatLng[];
  _remaining?: LatLng[];
}

/** OSRM driving route (fallback: a gently bent interpolated line). */
export async function fetchRoute(start: LatLng, end: LatLng): Promise<LatLng[]> {
  const url = 'https://router.project-osrm.org/route/v1/driving/' +
    `${start[1]},${start[0]};${end[1]},${end[0]}` +
    '?overview=full&geometries=geojson';
  try {
    const r = await fetch(url);
    const d = await r.json();
    if (d.routes && d.routes[0] && d.routes[0].geometry) {
      return d.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]] as LatLng);
    }
  } catch { /* network error → fallback below */ }
  const pts: LatLng[] = [];
  const n = 24;
  const midJitter = rand(-0.004, 0.004);
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const bend = Math.sin(f * Math.PI) * midJitter;
    pts.push([start[0] + (end[0] - start[0]) * f + bend, start[1] + (end[1] - start[1]) * f + bend]);
  }
  return pts;
}

export function routeLength(route: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) total += haversine(route[i - 1], route[i]);
  return total;
}

export interface SplitResult { position: LatLng | null; traveled: LatLng[]; remaining: LatLng[] }

/** Split a route at progress (0..1) into traveled / remaining + position. */
export function splitRoute(route: LatLng[], progress: number): SplitResult {
  if (!route || route.length < 2) {
    return { position: route ? route[0] : null, traveled: [], remaining: route || [] };
  }
  const p = Math.max(0, Math.min(1, progress));
  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    const d = haversine(route[i - 1], route[i]);
    segLens.push(d);
    total += d;
  }
  const target = p * total;
  let acc = 0;
  let idx = 0;
  for (; idx < segLens.length; idx++) {
    if (acc + segLens[idx] >= target) break;
    acc += segLens[idx];
  }
  if (idx >= segLens.length) {
    const last = route[route.length - 1];
    return { position: last, traveled: route.slice(), remaining: [last] };
  }
  const frac = segLens[idx] === 0 ? 0 : (target - acc) / segLens[idx];
  const a = route[idx];
  const b = route[idx + 1];
  const pos: LatLng = [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
  const traveled = route.slice(0, idx + 1).concat([pos]);
  const remaining = [pos].concat(route.slice(idx + 1));
  return { position: pos, traveled, remaining };
}

export interface ProjectResult { progress: number; position: LatLng | null; offRouteKm: number }

/** Project a real [lat,lng] point onto the route polyline. */
export function projectOnRoute(route: LatLng[], point: LatLng): ProjectResult {
  if (!route || route.length < 2 || !point) {
    return { progress: 0, position: route ? route[0] : point, offRouteKm: 0 };
  }
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((point[0] * Math.PI) / 180);
  const toXY = (p: LatLng): [number, number] => [(p[1] - point[1]) * mPerDegLng, (p[0] - point[0]) * mPerDegLat];

  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    const d = haversine(route[i - 1], route[i]);
    segLens.push(d);
    total += d;
  }

  let best = { d2: Infinity, seg: 0, t: 0 };
  for (let i = 1; i < route.length; i++) {
    const a = toXY(route[i - 1]);
    const b = toXY(route[i]);
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const len2 = abx * abx + aby * aby;
    let tt = len2 === 0 ? 0 : -(a[0] * abx + a[1] * aby) / len2;
    tt = Math.max(0, Math.min(1, tt));
    const px = a[0] + abx * tt;
    const py = a[1] + aby * tt;
    const d2 = px * px + py * py;
    if (d2 < best.d2) best = { d2, seg: i - 1, t: tt };
  }

  let acc = 0;
  for (let i = 0; i < best.seg; i++) acc += segLens[i];
  acc += segLens[best.seg] * best.t;
  const a = route[best.seg];
  const b = route[best.seg + 1];
  const position: LatLng = [a[0] + (b[0] - a[0]) * best.t, a[1] + (b[1] - a[1]) * best.t];
  return {
    progress: total === 0 ? 0 : acc / total,
    position,
    offRouteKm: Math.sqrt(best.d2) / 1000,
  };
}

/** Generate N walkers nearest to userLoc, of the opposite type. */
export async function generateWalkers(userLoc: LatLng, oppositeType: 'driver' | 'passenger', n: number): Promise<SimWalker[]> {
  const count = Math.max(1, Math.min(10, (n | 0) || 5));
  const POOL = count + 5;
  let cands: { start: LatLng; d: number }[] = [];
  for (let i = 0; i < POOL; i++) {
    const start = randomPoint(userLoc, rand(0.25, 2.7));
    cands.push({ start, d: haversine(userLoc, start) });
  }
  cands.sort((a, b) => a.d - b.d);
  cands = cands.slice(0, count);
  const colors = shuffle(PALETTE);
  const names = shuffle(NAMES);
  return Promise.all(cands.map(async (c, i): Promise<SimWalker> => {
    const dest = randomPoint(c.start, rand(2.5, 6.5));
    const route = await fetchRoute(c.start, dest);
    const lenKm = routeLength(route) || 1;
    const name = names[i % names.length];
    const isDriver = oppositeType === 'driver';
    const slowFactor = rand(1 / 8, 1 / 3);
    const kmPerTick = rand(0.010, 0.024) * slowFactor;
    return {
      id: 'sim_' + i + '_' + Date.now().toString(36),
      type: oppositeType, name, initials: initialsOf(name),
      vehicle: isDriver ? pick(VEHICLES) : null,
      seats: isDriver ? randInt(1, 4) : 1,
      color: colors[i % colors.length],
      route, lenKm, start: c.start, dest,
      progress: rand(0.04, 0.32),
      speed: kmPerTick / lenKm,
      rating: Math.round(rand(4.4, 5.0) * 10) / 10,
      trips: randInt(18, 420),
    };
  }));
}

/** Generate N walkers whose direction matches a fully-built user route. */
export async function generateWalkersForRoute(route: LatLng[], oppositeType: 'driver' | 'passenger', n: number): Promise<SimWalker[]> {
  const count = Math.max(1, Math.min(10, (n | 0) || 5));
  if (!route || route.length < 2) {
    return generateWalkers((route && route[0]) || TASHKENT, oppositeType, count);
  }
  const rStart = route[0];
  const rEnd = route[route.length - 1];
  const colors = shuffle(PALETTE);
  const names = shuffle(NAMES);
  const idxs: number[] = [];
  for (let i = 0; i < count; i++) idxs.push(i);
  return Promise.all(idxs.map(async (i): Promise<SimWalker> => {
    const start = randomPoint(rStart, rand(0.2, 1.6));
    const dest = randomPoint(rEnd, rand(0.3, 2.2));
    const wRoute = await fetchRoute(start, dest);
    const lenKm = routeLength(wRoute) || 1;
    const name = names[i % names.length];
    const isDriver = oppositeType === 'driver';
    const slowFactor = rand(1 / 8, 1 / 3);
    const kmPerTick = rand(0.010, 0.024) * slowFactor;
    return {
      id: 'simr_' + i + '_' + Date.now().toString(36),
      type: oppositeType, name, initials: initialsOf(name),
      vehicle: isDriver ? pick(VEHICLES) : null,
      seats: isDriver ? randInt(1, 4) : 1,
      color: colors[i % colors.length],
      route: wRoute, lenKm, start, dest,
      progress: rand(0.04, 0.32),
      speed: kmPerTick / lenKm,
      rating: Math.round(rand(4.4, 5.0) * 10) / 10,
      trips: randInt(18, 420),
      match: randInt(82, 98),
    };
  }));
}

interface SimOptions { intervalMs?: number; onTick?: (walkers: SimWalker[]) => void }

/** Build a ticking simulation that advances every walker's progress. */
export function createSimulation(walkers: SimWalker[], opts?: SimOptions) {
  const o = opts || {};
  const intervalMs = o.intervalMs || 450;
  let timer: ReturnType<typeof setInterval> | null = null;
  const arr = walkers.slice();

  function enrich(): SimWalker[] {
    return arr.map((w) => {
      const s = splitRoute(w.route, w.progress);
      return Object.assign({}, w, { position: s.position, _traveled: s.traveled, _remaining: s.remaining });
    });
  }
  function step() {
    for (const w of arr) {
      w.progress += w.speed;
      if (w.progress >= 1) w.progress = 0;
    }
    if (o.onTick) o.onTick(enrich());
  }
  return {
    enriched: enrich,
    walkers: () => arr,
    start() { if (!timer) timer = setInterval(step, intervalMs); },
    stop() { if (timer) { clearInterval(timer); timer = null; } },
  };
}

// Aggregate export mirroring the prototype's `window.WalkerSim`.
export const WalkerSim = {
  TASHKENT, haversine, randomPoint, randomUserLocation, fetchRoute,
  routeLength, splitRoute, projectOnRoute, generateWalkers, generateWalkersForRoute,
  createSimulation, bearing,
};

export default WalkerSim;
