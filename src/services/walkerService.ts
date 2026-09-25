/* ════════════════════════════════════════════════════════════════
   SERVICE — walker business logic (matching, filtering, ranking).
   Pure, UI-agnostic functions on top of walkerApi + RouteServer.
   ════════════════════════════════════════════════════════════════ */

import { walkerApi } from '@/api/walkerApi';
import { t } from '@/i18n';
import { hLabel, isoDate } from '@/utils/datetime';
import { RouteServer } from './routeService';
import { haversineKm } from '@/utils/geo';
import type { LatLng } from '@/utils/geo';
import type { Walker } from '@/models';

const MATCH_RADIUS_KM = 4;

export interface MatchFilters {
  type: 'all' | 'driver' | 'passenger';
  from?: { latlng: LatLng } | null;
  to?: { latlng: LatLng } | null;
  /** Local YYYY-MM-DD; empty = any day. */
  date: string;
  tStart: number;
  tEnd: number;
}

/** Fetch opposite-role planned trips for the Planned Trips board. */
export function listWalkers(role?: string) {
  return walkerApi.list(role);
}

/** Nearest N walkers to `center`, by start point. */
export function nearestWalkers(walkers: Walker[], center: LatLng, n = 10): Walker[] {
  return [...walkers]
    .sort((a, b) => haversineKm(center, a.fromLatlng) - haversineKm(center, b.fromLatlng))
    .slice(0, n);
}

/** Filter walkers against a schedule search filter and rank by distance. */
export function matchWalkers(walkers: Walker[], filters: MatchFilters, center: LatLng): Walker[] {
  return walkers
    .filter((w) => {
      if (filters.type !== 'all' && w.type !== filters.type) return false;
      if (filters.from && haversineKm(w.fromLatlng, filters.from.latlng) > MATCH_RADIUS_KM) return false;
      if (filters.to && haversineKm(w.toLatlng, filters.to.latlng) > MATCH_RADIUS_KM) return false;
      if (filters.date && isoDate(w.when) !== filters.date) return false;
      const h = w.when.getHours() + w.when.getMinutes() / 60;
      if (h < filters.tStart || h > filters.tEnd) return false;
      return true;
    })
    .sort((a, b) => haversineKm(center, a.fromLatlng) - haversineKm(center, b.fromLatlng));
}

interface SubmitForm {
  type: 'driver' | 'passenger';
  from: { latlng: LatLng; label: string };
  to: { latlng: LatLng; label: string };
  date: string;
  tStart: number;
  tEnd: number;
  seats: string;
  note: string;
}

/** The trip note the backend stores: the user's text plus the details that
    have no structured field (free seats for a driver, the departure window). */
export function composeNotes(form: SubmitForm): string | null {
  const lines = [
    form.note.trim(),
    form.type === 'driver' && Number(form.seats) > 0 ? t('form.seatsNote', { n: form.seats }) : '',
    form.tEnd > form.tStart ? t('form.windowNote', { from: hLabel(form.tStart), to: hLabel(form.tEnd) }) : '',
  ].filter(Boolean);
  return lines.length ? lines.join('\n') : null;
}

/** Submit the current user's own trip; precomputes its route on the server. */
export async function submitTrip(form: SubmitForm) {
  const created = await walkerApi.create({ ...form, note: composeNotes(form) });
  if (created && form.from && form.to) RouteServer.save(created.id, form.from.latlng, form.to.latlng);
  return created;
}
