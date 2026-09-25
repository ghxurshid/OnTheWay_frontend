/* SERVICE — trip history business logic + aggregate stats. */

import { historyApi } from '@/api/historyApi';
import type { Trip } from '@/models';

/** Fetch trip history. */
export function listHistory() {
  return historyApi.list();
}

/** Totals used by the history stats row: trips, kilometres and the average of
    the ratings the user gave (null when they rated nothing yet). */
export function historyTotals(history: Trip[]) {
  const totalKm = history.reduce((s, h) => s + (h.distanceKm ?? (parseFloat(h.km) || 0)), 0).toFixed(1);
  const rated = history.map((h) => h.rating).filter((r): r is number => typeof r === 'number' && r > 0);
  const averageRating = rated.length ? (rated.reduce((a, b) => a + b, 0) / rated.length).toFixed(1) : null;
  return { totalTrips: history.length, totalKm, averageRating };
}

/** Driver vs. passenger split used by the dashboard role chart. */
export function roleSplit(history: Trip[]) {
  const driverTrips = history.filter((h) => h.role === 'driver').length;
  const passTrips = history.filter((h) => h.role === 'passenger').length;
  const total = driverTrips + passTrips || 1;
  return { driverTrips, passTrips, driverPct: Math.round((driverTrips / total) * 100) };
}
