/* REPOSITORY — bookings (ride agreements).
   A passenger requests seats on a driver's trip; the driver accepts/rejects;
   either party can cancel; the driver completes. Realtime BookingEvents over the
   PresenceHub notify the affected party — these REST calls are the source of
   truth (they persist and enforce the domain rules). */

import { USE_MOCKS, mockResponse, http } from './client';

const post = (path) => http(path, { method: 'POST' });

export const bookingApi = {
  /** POST /bookings — request seats on a trip (status starts Pending). */
  create(tripId, seatsBooked = 1, message = null) {
    if (USE_MOCKS) return mockResponse({ id: 'bk_' + Date.now(), tripId, seatsBooked, status: 'Pending' });
    return http('/bookings', {
      method: 'POST',
      body: JSON.stringify({ tripId, seatsBooked, message }),
    });
  },

  /** Driver accepts a pending booking (reserves the seats). */
  accept(id) { return USE_MOCKS ? mockResponse(null) : post(`/bookings/${id}/accept`); },

  /** Driver rejects a pending booking. */
  reject(id) { return USE_MOCKS ? mockResponse(null) : post(`/bookings/${id}/reject`); },

  /** Either participant cancels (releases seats if it was accepted). */
  cancel(id) { return USE_MOCKS ? mockResponse(null) : post(`/bookings/${id}/cancel`); },

  /** Driver marks an accepted booking completed once the ride is done. */
  complete(id) { return USE_MOCKS ? mockResponse(null) : post(`/bookings/${id}/complete`); },

  /** GET /bookings/mine — the caller's bookings. */
  mine(pageNumber = 1, pageSize = 20) {
    if (USE_MOCKS) return mockResponse([]);
    return http(`/bookings/mine?pageNumber=${pageNumber}&pageSize=${pageSize}`).then((p) => p?.items || []);
  },
};
