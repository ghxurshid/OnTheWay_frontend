/* REPOSITORY — trips (/trips). Publish a driver or passenger trip, run the
   role-aware match search, start a planned trip into a live one, and read one
   trip. The backend wraps everything in the standard envelope; `http` unwraps it. */

import { USE_MOCKS, mockResponse, http } from './client';

export const tripApi = {
  /** POST /trips — publish a trip. Category "Planned"/"Live", role "Driver"/"Passenger". */
  create(payload: Record<string, unknown>) {
    if (USE_MOCKS) return mockResponse({ id: 'trip_' + Date.now(), ...payload });
    return http('/trips', { method: 'POST', body: JSON.stringify(payload) });
  },

  /** GET /trips/{id}. */
  getById(id: string) {
    if (USE_MOCKS) return mockResponse(null);
    return http(`/trips/${id}`);
  },

  /** GET /trips/search — the matching engine. `discoverRole` selects which role to
      find: a passenger looks for "Driver" trips, a driver looks for "Passenger" trips. */
  search(params: Record<string, unknown>) {
    if (USE_MOCKS) return mockResponse([]);
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== '')) as Record<string, string>);
    return http(`/trips/search?${q}`).then((rows) => rows || []);
  },

  /** POST /trips/{id}/start — start a planned trip, creating a new live trip. */
  start(id: string) {
    if (USE_MOCKS) return mockResponse({ id: 'live_' + Date.now(), originatingTripId: id });
    return http(`/trips/${id}/start`, { method: 'POST' });
  },

  /** POST /trips/{id}/complete — finish own trip (accepted bookings complete). */
  complete(id: string) {
    if (USE_MOCKS) return mockResponse({ id, status: 'Completed' });
    return http(`/trips/${id}/complete`, { method: 'POST' });
  },

  /** POST /trips/{id}/cancel — call off own trip (accepted bookings cancelled). */
  cancel(id: string) {
    if (USE_MOCKS) return mockResponse({ id, status: 'Cancelled' });
    return http(`/trips/${id}/cancel`, { method: 'POST' });
  },
};
