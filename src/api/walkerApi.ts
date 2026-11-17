/* REPOSITORY — scheduled walkers.
   Live endpoints return WalkerDto in the frontend's shape; we revive the
   `when` field back into a Date (the backend sends it as an ISO string), keep
   ids as strings and map the informational fields (`seats`, `completedTrips`). */

import { USE_MOCKS, mockResponse, http, send } from './client';
import { rememberMockTrip } from './tripApi';
import { WALKERS_DATA } from '@/mocks/walkers';
import { initialsOf } from '@/utils/avatar';
import type { LatLng } from '@/utils/geo';

interface WalkerRow { id: string; when?: string | Date; [k: string]: unknown }

/** A board row (WalkerDto) as the board reads it. `id` is the TRIP id;
    `userId` is the trip owner (the person to call, chat with, save, block). */
interface BoardRow extends WalkerRow {
  userId?: unknown;
  type?: string;
  name?: string;
  initials?: string;
  seats?: number | null;
  completedTrips?: number;
  /** The trip's notes as stored (owner's text + the departure-window line). */
  notes?: string | null;
}

/** Seats are informational: a whole number 1–8, anything else is "unknown". */
export const seatsOf = (v: unknown): number | null => {
  const n = Number(v);
  return v != null && v !== '' && Number.isInteger(n) && n >= 1 && n <= 8 ? n : null;
};

/** Loose shape of the SchedulePanel "create trip" form. */
interface CreateTripForm {
  from?: { latlng?: LatLng; label?: string };
  to?: { latlng?: LatLng; label?: string };
  date?: string;
  tStart?: number;
  distanceKm?: number | null;
  etaMinutes?: number | null;
  note?: string | null;
  type?: string;
  /** A driver's free seats (informational, 1–8). */
  seats?: string | number | null;
}

export const walkerApi = {
  /** GET /walkers — planned trips of BOTH roles for the separate Planned Trips
      board (without the caller's own, hidden or blocked ones). `role` is still
      sent but no longer narrows the result; each row's `type` says its role. */
  list(role?: string) {
    if (USE_MOCKS) return mockResponse(WALKERS_DATA).then((rows) => rows.map(toBoardWalker));
    const qs = role ? `?role=${encodeURIComponent(role)}` : '';
    return http(`/walkers${qs}`).then((rows) => (rows || []).map(toBoardWalker));
  },

  /** GET /walkers/online — profiles of the online walkers the caller may discover
      (the opposite of their own `role`), merged client-side with live positions
      from the PresenceHub by user id. */
  online(role?: string) {
    if (USE_MOCKS) return mockResponse([]);
    const qs = role ? `?role=${encodeURIComponent(role)}` : '';
    return http(`/walkers/online${qs}`).then((rows) => (rows || []).map((r: WalkerRow) => ({ ...r, id: String(r.id) })));
  },

  /** GET /walkers/:id — one walker's public profile (name, kind, rating), for a
      chat opened by id only (e.g. from a bot link); null when unknown. */
  profile(userId: string): Promise<{ id: string; name: string; kind?: string; vehicle?: string | null; photoUrl?: string | null } | null> {
    if (USE_MOCKS) return mockResponse(null);
    return http(`/walkers/${encodeURIComponent(userId)}`).then((p) => (p ? { ...p, id: String(p.id) } : null));
  },

  /** POST /trips — publish the current user's own trip. The form's role (driver/
      passenger) maps to a Driver or Passenger trip; the response (TripResponseDto)
      is mapped back to the walker shape the rest of the app uses. */
  create(form: CreateTripForm) {
    // Demo: the owner is the demo user ('me', see userApi).
    if (USE_MOCKS) return mockResponse({ id: rememberMockTrip(toCreateTripDto(form)), userId: 'me', ...form, when: new Date() });
    return send('POST', '/trips', toCreateTripDto(form)).then(tripToWalker);
  },
};

/** Map a board WalkerDto into the walker shape: `when` as a Date, string ids
    (trip `id`, owner `userId` — demo rows without one use their own id),
    initials, a driver's seats, the completed-trip count as `trips` and the
    trip's `notes` as `note` (trimmed; null when empty). */
export function toBoardWalker(r: BoardRow) {
  if (!r) return r;
  const { notes, ...rest } = r;
  const driver = String(r.type || '').toLowerCase() === 'driver';
  return {
    ...rest,
    note: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
    id: String(r.id),
    userId: r.userId != null && r.userId !== '' ? String(r.userId) : String(r.id),
    initials: r.initials || initialsOf(r.name),
    ...(r.when ? { when: new Date(r.when) } : {}),
    seats: driver ? seatsOf(r.seats) : null,
    trips: typeof r.completedTrips === 'number' ? r.completedTrips : 0,
  };
}

/** Map the SchedulePanel form → CreateTripRequestDto. A driver's seats travel
    as their own field (a passenger's are not sent; a driver without a choice
    gets the vehicle's seats on the server). */
export function toCreateTripDto(form: CreateTripForm) {
  const fromLL = form.from?.latlng || [0, 0];
  const toLL = form.to?.latlng || [0, 0];
  const seats = form.type === 'driver' ? seatsOf(form.seats) : null;
  return {
    origin: { latitude: fromLL[0], longitude: fromLL[1], address: form.from?.label || '' },
    destination: { latitude: toLL[0], longitude: toLL[1], address: form.to?.label || '' },
    departureTimeUtc: combineWhen(form.date, form.tStart),
    distanceKm: form.distanceKm ?? null,
    estimatedMinutes: form.etaMinutes ?? null,
    notes: form.note || null,
    category: 'Planned',
    role: form.type === 'driver' ? 'Driver' : 'Passenger',
    ...(seats != null ? { seats } : {}),
  };
}

interface TripResponseDto {
  id: string;
  /** The trip owner (whatever the role). */
  driverId?: string | number;
  userId?: string | number;
  role?: string;
  origin?: { address?: string; latitude?: number; longitude?: number };
  destination?: { address?: string; latitude?: number; longitude?: number };
  departureTimeUtc?: string;
  seats?: number | null;
}

/** Map a TripResponseDto back into the walker shape used across the app
    (`id` = the trip, `userId` = its owner). */
export function tripToWalker(tp: TripResponseDto | null) {
  if (!tp) return tp;
  const owner = tp.userId ?? tp.driverId;
  return {
    id: String(tp.id),
    ...(owner != null && owner !== '' ? { userId: String(owner) } : {}),
    type: (tp.role || 'Driver').toLowerCase(),
    from: tp.origin?.address || '',
    to: tp.destination?.address || '',
    fromLatlng: [tp.origin?.latitude ?? 0, tp.origin?.longitude ?? 0] as LatLng,
    toLatlng: [tp.destination?.latitude ?? 0, tp.destination?.longitude ?? 0] as LatLng,
    when: tp.departureTimeUtc ? new Date(tp.departureTimeUtc) : new Date(),
    seats: seatsOf(tp.seats),
  };
}

/** "2026-06-26" + hour 8 → ISO UTC instant the backend can parse. */
function combineWhen(dateIso?: string, hour = 0): string {
  const base = dateIso ? new Date(dateIso) : new Date();
  base.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  return base.toISOString();
}
