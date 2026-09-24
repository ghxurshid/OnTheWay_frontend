/* ════════════════════════════════════════════════════════════════
   SERVICE — WALKER SIMULATION ENGINE (mock/demo mode only)
   Generates plausible walkers around the user and advances them along
   OSRM routes. Pure data + geometry, decoupled from Leaflet/React — the map
   layer renders whatever this produces.
   ════════════════════════════════════════════════════════════════ */

import { TASHKENT } from '@/constants/map';
import { getRoute, routeCoords } from '@/services/routeService';
import { SIM_COUNT } from '@/services/simStore';
import { AVATAR_PALETTE, initialsOf } from '@/utils/avatar';
import { haversineKm, routeLength, splitRoute } from '@/utils/geo';
import type { LatLng } from '@/utils/geo';

type PartyType = 'driver' | 'passenger';

const KM_PER_DEG = 111;

const rand = (min: number, max: number): number => min + Math.random() * (max - min);
const randInt = (min: number, max: number): number => Math.floor(rand(min, max + 1));
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const clampCount = (n: number): number =>
  Math.max(SIM_COUNT.min, Math.min(SIM_COUNT.max, (n | 0) || SIM_COUNT.default));

export function randomPoint(center: LatLng, radiusKm: number): LatLng {
  const w = (radiusKm / KM_PER_DEG) * Math.sqrt(Math.random());
  const t = 2 * Math.PI * Math.random();
  return [center[0] + w * Math.cos(t), center[1] + (w * Math.sin(t)) / Math.cos((center[0] * Math.PI) / 180)];
}

export const randomUserLocation = (): LatLng => randomPoint(TASHKENT, rand(0.5, 3.2));

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

/** A simulated walker with a precomputed route. */
export interface SimWalker {
  id: string;
  type: PartyType;
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
  const [route] = await getRoute([start, end], { alternatives: false });
  if (route?.geometry) return routeCoords(route);
  const n = 24;
  const bend = rand(-0.004, 0.004);
  return Array.from({ length: n + 1 }, (_, i): LatLng => {
    const f = i / n;
    const b = Math.sin(f * Math.PI) * bend;
    return [start[0] + (end[0] - start[0]) * f + b, start[1] + (end[1] - start[1]) * f + b];
  });
}

interface Looks { names: string[]; colors: string[] }
const newLooks = (): Looks => ({ names: shuffle(NAMES), colors: shuffle(AVATAR_PALETTE) });

/** The i-th simulated walker of `type`, travelling start → dest. */
async function makeWalker(i: number, start: LatLng, dest: LatLng, type: PartyType, looks: Looks,
  idPrefix: string): Promise<SimWalker> {
  const route = await fetchRoute(start, dest);
  const lenKm = routeLength(route) || 1;
  const name = looks.names[i % looks.names.length];
  const isDriver = type === 'driver';
  const kmPerTick = rand(0.010, 0.024) * rand(1 / 8, 1 / 3); // slow enough to watch
  return {
    id: `${idPrefix}_${i}_${Date.now().toString(36)}`,
    type, name, initials: initialsOf(name),
    vehicle: isDriver ? pick(VEHICLES) : null,
    seats: isDriver ? randInt(1, 4) : 1,
    color: looks.colors[i % looks.colors.length],
    route, lenKm, start, dest,
    progress: rand(0.04, 0.32),
    speed: kmPerTick / lenKm,
    rating: Math.round(rand(4.4, 5.0) * 10) / 10,
    trips: randInt(18, 420),
  };
}

/** Generate the N walkers nearest to userLoc, of the opposite type. */
export async function generateWalkers(userLoc: LatLng, oppositeType: PartyType, n: number): Promise<SimWalker[]> {
  const count = clampCount(n);
  const looks = newLooks();
  const starts = Array.from({ length: count + 5 }, () => randomPoint(userLoc, rand(0.25, 2.7)))
    .sort((a, b) => haversineKm(userLoc, a) - haversineKm(userLoc, b))
    .slice(0, count);
  return Promise.all(starts.map((start, i) =>
    makeWalker(i, start, randomPoint(start, rand(2.5, 6.5)), oppositeType, looks, 'sim')));
}

/** Generate N walkers whose direction matches a fully-built user route. */
export async function generateWalkersForRoute(route: LatLng[], oppositeType: PartyType, n: number): Promise<SimWalker[]> {
  const count = clampCount(n);
  if (!route || route.length < 2) return generateWalkers(route?.[0] || TASHKENT, oppositeType, count);
  const [routeStart, routeEnd] = [route[0], route[route.length - 1]];
  const looks = newLooks();
  return Promise.all(Array.from({ length: count }, async (_, i) => ({
    ...(await makeWalker(i, randomPoint(routeStart, rand(0.2, 1.6)), randomPoint(routeEnd, rand(0.3, 2.2)),
      oppositeType, looks, 'simr')),
    match: randInt(82, 98),
  })));
}

interface SimOptions { intervalMs?: number; onTick?: (walkers: SimWalker[]) => void }

/** Build a ticking simulation that advances every walker's progress. */
export function createSimulation(walkers: SimWalker[], { intervalMs = 450, onTick }: SimOptions = {}) {
  let timer: ReturnType<typeof setInterval> | null = null;
  const arr = walkers.slice();

  const enriched = (): SimWalker[] => arr.map((w) => {
    const s = splitRoute(w.route, w.progress);
    return { ...w, position: s.position, _traveled: s.traveled, _remaining: s.remaining };
  });
  const step = () => {
    for (const w of arr) {
      w.progress += w.speed;
      if (w.progress >= 1) w.progress = 0;
    }
    onTick?.(enriched());
  };
  return {
    enriched,
    start() { if (!timer) timer = setInterval(step, intervalMs); },
    stop() { if (timer) { clearInterval(timer); timer = null; } },
  };
}

export type Simulation = ReturnType<typeof createSimulation>;
