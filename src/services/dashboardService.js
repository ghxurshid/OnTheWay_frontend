/* SERVICE — dashboard analytics. */

import { dashboardApi } from '@/api/dashboardApi';

/** Fetch raw dashboard summary (weekly km + top destinations). */
export function getDashboardSummary() {
  return dashboardApi.getSummary();
}

/** Derive headline metrics from the weekly series. */
export function weeklyMetrics(weekly) {
  const totalWeek = weekly.reduce((s, v) => s + v, 0).toFixed(1);
  return {
    totalWeek,
    activeDays: weekly.filter((v) => v > 0).length,
    co2Saved: (parseFloat(totalWeek) * 0.21).toFixed(1),
    moneySaved: Math.round(parseFloat(totalWeek) * 1500),
  };
}
