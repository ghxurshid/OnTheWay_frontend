/* REPOSITORY — trip history. */

import { USE_MOCKS, mockResponse, http } from './client';
import { HISTORY_DATA } from '@/mocks/history';

export const historyApi = {
  /** GET /history */
  list() {
    if (USE_MOCKS) return mockResponse(HISTORY_DATA);
    return http('/history').then((rows) => rows.map((h: { date: string }) => ({ ...h, date: new Date(h.date) })));
  },
};
