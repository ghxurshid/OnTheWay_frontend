/* REPOSITORY — dashboard analytics. */

import { USE_MOCKS, mockResponse, http } from './client';
import { WEEKLY_KM, TOP_DESTINATIONS } from '@/mocks/dashboard';

export const dashboardApi = {
  /** GET /dashboard/summary */
  getSummary() {
    if (USE_MOCKS) return mockResponse({ weekly: WEEKLY_KM, destinations: TOP_DESTINATIONS });
    return http('/dashboard/summary');
  },
};
