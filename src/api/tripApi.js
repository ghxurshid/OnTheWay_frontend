/* REPOSITORY — trips (/trips). Publish a driver or passenger trip, run the
   role-aware match search, start a planned trip into a live one, and read one
   trip. The backend wraps everything in the standard envelope; `http` unwraps it. */

import { USE_MOCKS, mockResponse, http } from './client';

export const tripApi = {
  /** POST /trips — publish a trip. Category "Planned"/"Live", role "Driver"/"Passenger". */
  create(payload) {
    if (USE_MOCKS) return mockResponse({ id: 'trip_' + Date.now(), ...payload });
    return http('/trips', { method: 'POST', body: JSON.stringify(payload) });
  },

  /** GET /trips/{id}. */
  getById(id) {
    if (USE_MOCKS) return mockResponse(null);
    return http(`/trips/${id}`);
  },

  /**
   * GET /trips/search — the matching engine. `discoverRole` selects which role to
   * find: a passenger looks for "Driver" trips, a driver looks for "Passenger" trips.
   * @param params { originLatitude, originLongitude, destinationLatitude,
   *   destinationLongitude, seatsNeeded?, maxResults?, discoverRole?, contactsOnly?,
   *   earliestDepartureUtc?, latestDepartureUtc?, maxOriginDistanceKm?, maxDestinationDistanceKm? }
   */
  search(params) {
    if (USE_MOCKS) return mockResponse([]);
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== '')));
    return http(`/trips/search?${q}`).then((rows) => rows || []);
  },

  /** POST /trips/{id}/start — start a planned trip, creating a new live trip. */
  start(id) {
    if (USE_MOCKS) return mockResponse({ id: 'live_' + Date.now(), originatingTripId: id });
    return http(`/trips/${id}/start`, { method: 'POST' });
  },
};
