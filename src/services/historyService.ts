/* SERVICE — trip history business logic + aggregate stats. */

import { historyApi } from '@/api/historyApi';
import type { Trip } from '@/models';

/** Fetch trip history. */
export function listHistory() {
  return historyApi.list();
}

/** Totals used by the history stats row. */
export function historyTotals(history: Trip[]) {
  const totalKm = history.reduce((s, h) => s + parseFloat(h.km), 0).toFixed(1);
  return { totalTrips: history.length, totalKm };
}

/** Driver vs. passenger split used by the dashboard role chart. */
export function roleSplit(history: Trip[]) {
  const driverTrips = history.filter((h) => h.role === 'driver').length;
  const passTrips = history.filter((h) => h.role === 'passenger').length;
  const total = driverTrips + passTrips || 1;
  return { driverTrips, passTrips, driverPct: Math.round((driverTrips / total) * 100) };
}
