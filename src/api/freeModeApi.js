/* REPOSITORY — Free Mode (/free-mode). A driver is available without a predefined
   destination, sharing only a current location and online status; passengers can
   discover nearby Free Mode drivers ranked purely by distance. */

import { USE_MOCKS, mockResponse, http } from './client';

export const freeModeApi = {
  /** POST /free-mode/start — enter Free Mode at the given location (driver only). */
  start(location) {
    if (USE_MOCKS) return mockResponse({ id: 'fm_' + Date.now(), isActive: true, isOnline: true });
    return http('/free-mode/start', { method: 'POST', body: JSON.stringify({ location }) });
  },

  /** PUT /free-mode/location — report a new Free Mode position. */
  updateLocation(latitude, longitude, address = null) {
    if (USE_MOCKS) return mockResponse({ latitude, longitude, isActive: true, isOnline: true });
    return http('/free-mode/location', {
      method: 'PUT',
      body: JSON.stringify({ latitude, longitude, address }),
    });
  },

  /** POST /free-mode/stop — leave Free Mode. */
  stop() {
    if (USE_MOCKS) return mockResponse(true);
    return http('/free-mode/stop', { method: 'POST' });
  },

  /** GET /free-mode/nearby — discoverable Free Mode drivers ranked by distance. */
  nearby(latitude, longitude, radiusKm = 10, max = 20) {
    if (USE_MOCKS) return mockResponse([]);
    const q = new URLSearchParams({ latitude, longitude, radiusKm, max });
    return http(`/free-mode/nearby?${q}`).then((rows) => rows || []);
  },
};
