/* REPOSITORY — trips (/trips). Publish a driver or passenger trip, run the
   role-aware match search, start a planned trip in place, read one trip, toggle
   discovery visibility (band/engaged) and complete/cancel own trips. The backend
   wraps everything in the standard envelope; `http` unwraps it. Booking was
   removed — arrangements happen over chat/call and "band" is a visibility toggle. */

import { USE_MOCKS, mockResponse, http } from './client';

const post = (path: string, body?: unknown) =>
  http(path, { method: 'POST', ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });

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

  /** POST /trips/{id}/start — move a planned trip in place (Scheduled→InProgress);
      the same record, no new trip is spawned. */
  start(id: string) {
    if (USE_MOCKS) return mockResponse({ id, status: 'InProgress' });
    return post(`/trips/${id}/start`);
  },

  /** POST /trips/{id}/hide — mark own trip "engaged/full" (band): hidden from
      discovery and the opposite-role maps. Reversible via `show`. */
  hide(id: string) {
    if (USE_MOCKS) return mockResponse({ id, isVisible: false });
    return post(`/trips/${id}/hide`);
  },

  /** POST /trips/{id}/show — restore own trip to discovery ("bo'sh"ga qaytish). */
  show(id: string) {
    if (USE_MOCKS) return mockResponse({ id, isVisible: true });
    return post(`/trips/${id}/show`);
  },

  /** POST /trips/{id}/complete — finish own trip and optionally confirm the real
      companions who travelled (drives ratings, history and statistics). */
  complete(id: string, companionIds: (string | number)[] = []) {
    if (USE_MOCKS) return mockResponse({ id, status: 'Completed' });
    return post(`/trips/${id}/complete`, { companionIds });
  },

  /** POST /trips/{id}/cancel — call off own trip (simply closes it). */
  cancel(id: string) {
    if (USE_MOCKS) return mockResponse({ id, status: 'Cancelled' });
    return post(`/trips/${id}/cancel`);
  },
};
