/* REPOSITORY — scheduled walkers.
   Live endpoints return WalkerDto in the frontend's shape; we only revive the
   `when` field back into a Date (the backend sends it as an ISO string). */

import { USE_MOCKS, mockResponse, http } from './client';
import { WALKERS_DATA } from '@/mocks/walkers';
import type { LatLng } from '@/utils/geo';

interface WalkerRow { id: string; when?: string | Date; [k: string]: unknown }

/** Loose shape of the SchedulePanel "create trip" form. */
interface CreateTripForm {
  from?: { latlng?: LatLng; label?: string };
  to?: { latlng?: LatLng; label?: string };
  date?: string;
  tStart?: number;
  seats?: number | string;
  pricePerSeat?: number;
  distanceKm?: number | null;
  etaMinutes?: number | null;
  note?: string | null;
  type?: string;
}

export const walkerApi = {
  /** GET /walkers — opposite-role planned trips for the separate Planned Trips
      board (pass the caller's own `role`; the backend returns the opposite). */
  list(role?: string) {
    if (USE_MOCKS) return mockResponse(WALKERS_DATA);
    const qs = role ? `?role=${encodeURIComponent(role)}` : '';
    return http(`/walkers${qs}`).then((rows) => (rows || []).map(reviveWhen));
  },

  /** GET /walkers/online — profiles of the online walkers the caller may discover
      (the opposite of their own `role`), merged client-side with live positions
      from the PresenceHub by user id. */
  online(role?: string) {
    if (USE_MOCKS) return mockResponse([]);
    const qs = role ? `?role=${encodeURIComponent(role)}` : '';
    return http(`/walkers/online${qs}`).then((rows) => (rows || []).map((r: WalkerRow) => ({ ...r, id: String(r.id) })));
  },

  /** Resolve one walker from the scheduled list (no dedicated backend route). */
  getById(id: string) {
    if (USE_MOCKS) return mockResponse(WALKERS_DATA.find((w) => w.id === id) || null);
    return this.list().then((rows) => rows.find((w: WalkerRow) => w.id === id) || null);
  },

  /** POST /trips — publish the current user's own trip. The form's role (driver/
      passenger) maps to a Driver or Passenger trip; the response (TripResponseDto)
      is mapped back to the walker shape the rest of the app uses. */
  create(form: CreateTripForm) {
    if (USE_MOCKS) return mockResponse({ id: 'me_' + Date.now(), ...form, when: new Date() });
    return http('/trips', {
      method: 'POST',
      body: JSON.stringify(toCreateTripDto(form)),
    }).then(tripToWalker);
  },
};

const reviveWhen = (w: WalkerRow) => (w && w.when ? { ...w, when: new Date(w.when) } : w);

/** Map the SchedulePanel form → CreateTripRequestDto. */
function toCreateTripDto(form: CreateTripForm) {
  const fromLL = form.from?.latlng || [0, 0];
  const toLL = form.to?.latlng || [0, 0];
  return {
    origin: { latitude: fromLL[0], longitude: fromLL[1], address: form.from?.label || '' },
    destination: { latitude: toLL[0], longitude: toLL[1], address: form.to?.label || '' },
    departureTimeUtc: combineWhen(form.date, form.tStart),
    totalSeats: Number(form.seats) || 1,
    pricePerSeat: form.pricePerSeat ?? 0,
    distanceKm: form.distanceKm ?? null,
    estimatedMinutes: form.etaMinutes ?? null,
    notes: form.note || null,
    category: 'Planned',
    role: form.type === 'driver' ? 'Driver' : 'Passenger',
  };
}

interface TripResponseDto {
  id: string;
  role?: string;
  origin?: { address?: string; latitude?: number; longitude?: number };
  destination?: { address?: string; latitude?: number; longitude?: number };
  departureTimeUtc?: string;
  totalSeats?: number;
}

/** Map a TripResponseDto back into the walker shape used across the app. */
function tripToWalker(tp: TripResponseDto | null) {
  if (!tp) return tp;
  return {
    id: tp.id,
    type: (tp.role || 'Driver').toLowerCase(),
    from: tp.origin?.address || '',
    to: tp.destination?.address || '',
    fromLatlng: [tp.origin?.latitude ?? 0, tp.origin?.longitude ?? 0] as LatLng,
    toLatlng: [tp.destination?.latitude ?? 0, tp.destination?.longitude ?? 0] as LatLng,
    when: tp.departureTimeUtc ? new Date(tp.departureTimeUtc) : new Date(),
    seats: tp.totalSeats ?? 1,
  };
}

/** "2026-06-26" + hour 8 → ISO UTC instant the backend can parse. */
function combineWhen(dateIso?: string, hour = 0): string {
  const base = dateIso ? new Date(dateIso) : new Date();
  base.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  return base.toISOString();
}
