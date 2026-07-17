/* REPOSITORY — personal saved routes (/saved-routes). Reusable templates created
   from a trip and used to publish new trips with minimal input. */

import { USE_MOCKS, mockResponse, http } from './client';

export const savedRoutesApi = {
  /** GET /saved-routes — the caller's saved routes. */
  list() {
    if (USE_MOCKS) return mockResponse([]);
    return http('/saved-routes').then((rows) => rows || []);
  },

  /** POST /saved-routes — save an existing trip's route as a template. */
  save(tripId: string, name: string, description: string | null = null) {
    if (USE_MOCKS) return mockResponse({ id: 'sr_' + Date.now(), name, description });
    return http('/saved-routes', {
      method: 'POST',
      body: JSON.stringify({ tripId, name, description }),
    });
  },

  /** POST /saved-routes/{id}/trips — one-click publish a new trip from a template. */
  createTrip(id: string, payload: Record<string, unknown>) {
    if (USE_MOCKS) return mockResponse({ id: 'trip_' + Date.now(), ...payload });
    return http(`/saved-routes/${id}/trips`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** DELETE /saved-routes/{id} — remove one of the caller's saved routes. */
  remove(id: string) {
    if (USE_MOCKS) return mockResponse(true);
    return http(`/saved-routes/${id}`, { method: 'DELETE' });
  },
};
