/* REPOSITORY — dashboard analytics. */

import { USE_MOCKS, mockResponse, http } from './client';
import { WEEKLY_KM, TOP_DESTINATIONS } from '@/mocks/dashboard';

export const dashboardApi = {
  /** GET /dashboard/summary */
  getSummary() {
    if (USE_MOCKS) return mockResponse({ weekly: WEEKLY_KM, destinations: TOP_DESTINATIONS });
    return http('/dashboard/summary');
  },

  /** GET /dashboard/statistics — full metrics for a reporting period.
      @param period one of Today/Yesterday/ThisWeek/ThisMonth/LastMonth/Last3Months/
        LastYear/AllTime/Custom. `from`/`to` are ISO strings, only for Custom. */
  getStatistics(period = 'AllTime', from: string | null = null, to: string | null = null) {
    if (USE_MOCKS) {
      return mockResponse({
        period, fromUtc: null, toUtc: null,
        totalCompletedTrips: 0, driverTrips: 0, passengerTrips: 0, cancelledTrips: 0,
        totalDistanceKm: 0, totalTravelMinutes: 0, averageTripDistanceKm: 0,
        averageTripDurationMinutes: 0, totalPassengersTransported: 0, averageVehicleOccupancy: 0,
        estimated: { fuelSavedLiters: 0, co2ReducedKg: 0, costSaved: 0 },
      });
    }
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries({ period, from, to }).filter(([, v]) => v != null)) as Record<string, string>);
    return http(`/dashboard/statistics?${q}`);
  },
};
