/* REPOSITORY — scheduled walkers. Mock-backed today; flip to `http` to go live.
   Note: live endpoints must hydrate `when` back into a Date (mocks already are). */

import { USE_MOCKS, mockResponse, http } from './client';
import { WALKERS_DATA } from '@/mocks/walkers';

export const walkerApi = {
  /** GET /walkers — all scheduled walkers. */
  list() {
    if (USE_MOCKS) return mockResponse(WALKERS_DATA);
    return http('/walkers').then((rows) => rows.map(reviveWhen));
  },

  /** GET /walkers/:id */
  getById(id) {
    if (USE_MOCKS) return mockResponse(WALKERS_DATA.find((w) => w.id === id) || null);
    return http(`/walkers/${id}`).then(reviveWhen);
  },

  /** POST /walkers — submit the current user's own trip. */
  create(trip) {
    if (USE_MOCKS) return mockResponse({ id: 'me_' + Date.now(), ...trip });
    return http('/walkers', { method: 'POST', body: JSON.stringify(trip) });
  },
};

const reviveWhen = (w) => (w && w.when ? { ...w, when: new Date(w.when) } : w);
