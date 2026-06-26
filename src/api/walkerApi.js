/* REPOSITORY — scheduled walkers.
   Live endpoints return WalkerDto in the frontend's shape; we only revive the
   `when` field back into a Date (the backend sends it as an ISO string). */

import { USE_MOCKS, mockResponse, http } from './client';
import { WALKERS_DATA } from '@/mocks/walkers';

export const walkerApi = {
  /** GET /walkers — all scheduled walkers (others' upcoming trips). */
  list() {
    if (USE_MOCKS) return mockResponse(WALKERS_DATA);
    return http('/walkers').then((rows) => (rows || []).map(reviveWhen));
  },

  /** Resolve one walker from the scheduled list (no dedicated backend route). */
  getById(id) {
    if (USE_MOCKS) return mockResponse(WALKERS_DATA.find((w) => w.id === id) || null);
    return this.list().then((rows) => rows.find((w) => w.id === id) || null);
  },

  /** POST /walkers — publish the current user's own trip. */
  create(form) {
    if (USE_MOCKS) return mockResponse({ id: 'me_' + Date.now(), ...form });
    return http('/walkers', {
      method: 'POST',
      body: JSON.stringify(toCreateDto(form)),
    }).then(reviveWhen);
  },
};

const reviveWhen = (w) => (w && w.when ? { ...w, when: new Date(w.when) } : w);

/** Map the SchedulePanel form → CreateWalkerRequestDto. */
function toCreateDto(form) {
  return {
    from: form.from?.label || '',
    to: form.to?.label || '',
    fromLatlng: form.from?.latlng || [0, 0],
    toLatlng: form.to?.latlng || [0, 0],
    when: combineWhen(form.date, form.tStart),
    seats: Number(form.seats) || 1,
    pricePerSeat: form.pricePerSeat ?? null,
    distanceKm: form.distanceKm ?? null,
    etaMinutes: form.etaMinutes ?? null,
    notes: form.note || null,
  };
}

/** "2026-06-26" + hour 8 → ISO UTC instant the backend can parse. */
function combineWhen(dateIso, hour = 0) {
  const base = dateIso ? new Date(dateIso) : new Date();
  base.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  return base.toISOString();
}
