/* REPOSITORY — the authenticated user (/users/me). */

import { USE_MOCKS, mockResponse, http } from './client';

const MOCK_ME = {
  id: 'me', email: 'demo@ontheway.uz', fullName: 'Alisher Karimov',
  firstName: 'Alisher', lastName: 'Karimov', phoneNumber: null, photoUrl: null,
  vehicle: null, kind: 'passenger', ratingAverage: 0, ratingCount: 0,
  isActive: true, roles: [],
};

export const userApi = {
  /** GET /users/me — the caller's own profile. */
  me() {
    if (USE_MOCKS) return mockResponse(MOCK_ME);
    return http('/users/me');
  },

  /** PUT /users/me/vehicle — set/clear vehicle (driver ⇄ passenger). */
  updateVehicle(vehicle) {
    if (USE_MOCKS) return mockResponse({ vehicle, kind: vehicle ? 'driver' : 'passenger' });
    return http('/users/me/vehicle', { method: 'PUT', body: JSON.stringify({ vehicle }) });
  },
};
