/* ════════════════════════════════════════════════════════════════
   SERVICE — walker business logic (matching, filtering, ranking).
   Pure, UI-agnostic functions on top of walkerApi + RouteServer.
   ════════════════════════════════════════════════════════════════ */

import { walkerApi } from '@/api/walkerApi';
import { RouteServer } from './routeService';
import { haversineKm } from '@/utils/geo';

const MATCH_RADIUS_KM = 4;

/** Fetch opposite-role planned trips for the Planned Trips board (pass the
    caller's own role; the backend returns the opposite role's plans). */
export function listWalkers(role) {
  return walkerApi.list(role);
}

/** Nearest N walkers to `center`, by start point. */
export function nearestWalkers(walkers, center, n = 10) {
  return [...walkers]
    .sort((a, b) => haversineKm(center, a.fromLatlng) - haversineKm(center, b.fromLatlng))
    .slice(0, n);
}

/**
 * Filter walkers against a schedule search filter and rank by distance.
 * filters: { type, from, to, tStart, tEnd, seats }
 *   - from/to: { latlng } | null
 *   - seats: 'any' | '1'..'4'
 */
export function matchWalkers(walkers, filters, center) {
  return walkers
    .filter((w) => {
      if (filters.type !== 'all' && w.type !== filters.type) return false;
      if (filters.from && haversineKm(w.fromLatlng, filters.from.latlng) > MATCH_RADIUS_KM) return false;
      if (filters.to && haversineKm(w.toLatlng, filters.to.latlng) > MATCH_RADIUS_KM) return false;
      const h = w.when.getHours() + w.when.getMinutes() / 60;
      if (h < filters.tStart || h > filters.tEnd) return false;
      if (filters.type === 'driver' && filters.seats !== 'any' && w.seats < Number(filters.seats)) return false;
      return true;
    })
    .sort((a, b) => haversineKm(center, a.fromLatlng) - haversineKm(center, b.fromLatlng));
}

/** Submit the current user's own trip; precomputes its route on the server. */
export async function submitTrip(form) {
  const created = await walkerApi.create(form);
  if (form.from && form.to) RouteServer.save(created.id, form.from.latlng, form.to.latlng);
  return created;
}
