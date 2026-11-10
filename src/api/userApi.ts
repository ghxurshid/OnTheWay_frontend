/* REPOSITORY — the authenticated user (/users/me). */

import { USE_MOCKS, mockResponse, http, send } from './client';

/** The structured car of a driver, as the backend stores it (R1). */
export interface VehicleInfoDto {
  model: string;
  color: string | null;
  plate: string | null;
  seats: number | null;
}

/** GET /users/me — UserResponseDto (only the fields the app reads are typed). */
export interface MeDto {
  id: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string | null;
  /** The one-line car ("model · color · plate"), derived by the server. */
  vehicle: string | null;
  /** 'driver' when a vehicle is set, else 'passenger' (derived by the server). */
  kind?: string;
  ratingAverage?: number;
  ratingCount?: number;
  vehicleInfo: VehicleInfoDto | null;
}

/** PUT /users/me/vehicle — VehicleResultDto. */
export interface VehicleResultDto {
  vehicle: string | null;
  kind?: string;
  vehicleInfo: VehicleInfoDto | null;
}

/** What the profile form saves; `null` clears the car (back to passenger). */
export interface VehicleInput { model: string; color?: string | null; plate?: string | null; seats?: number | null }

const line = (v: VehicleInfoDto | null): string | null =>
  (v ? [v.model, v.color, v.plate].map((s) => (s || '').trim()).filter(Boolean).join(' · ') : '') || null;

// Demo mode: the car "saved on the server" for this session.
let mockVehicle: VehicleInfoDto | null = null;

const MOCK_ME = {
  id: 'me', email: 'demo@ontheway.uz', fullName: 'Alisher Karimov',
  firstName: 'Alisher', lastName: 'Karimov', phoneNumber: null, photoUrl: null,
  ratingAverage: 0, ratingCount: 0, isActive: true, roles: [],
};

/** The request body: structured when there is a car, every field null to clear. */
export function toVehicleBody(input: VehicleInput | null) {
  if (!input || !input.model.trim()) return { vehicle: null, model: null, color: null, plate: null, seats: null };
  const color = (input.color || '').trim();
  const plate = (input.plate || '').trim().toUpperCase();
  return { model: input.model.trim(), color: color || null, plate: plate || null, seats: input.seats ?? null };
}

export const userApi = {
  /** GET /users/me — the caller's own profile. */
  me(): Promise<MeDto> {
    if (USE_MOCKS) {
      return mockResponse({ ...MOCK_ME, vehicle: line(mockVehicle), kind: mockVehicle ? 'driver' : 'passenger', vehicleInfo: mockVehicle });
    }
    return http<MeDto>('/users/me').then((me) => ({ ...me, id: String(me?.id ?? ''), vehicleInfo: me?.vehicleInfo ?? null }));
  },

  /** PUT /users/me/vehicle — set the structured car, or clear it with `null`
      (driver ⇄ passenger). The server derives the one-line `vehicle`. */
  updateVehicle(input: VehicleInput | null): Promise<VehicleResultDto> {
    const body = toVehicleBody(input);
    if (USE_MOCKS) {
      mockVehicle = body.model ? { model: body.model, color: body.color, plate: body.plate, seats: body.seats } : null;
      return mockResponse({ vehicle: line(mockVehicle), kind: mockVehicle ? 'driver' : 'passenger', vehicleInfo: mockVehicle });
    }
    return send<VehicleResultDto>('PUT', '/users/me/vehicle', body)
      .then((r) => ({ vehicle: r?.vehicle ?? null, kind: r?.kind, vehicleInfo: r?.vehicleInfo ?? null }));
  },
};
