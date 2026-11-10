/* ════════════════════════════════════════════════════════════════
   SERVICE — my profile (rating + car).
   The server (GET /users/me, PUT /users/me/vehicle) is the source of
   truth for the car; `prefsStore.vehicle` is its local mirror, read
   synchronously by the drawer, the chat, the create-trip sheet (default
   seats) and the "add your car" hint. The mirror is refreshed once per
   boot and whenever the profile screen loads or saves.
   ════════════════════════════════════════════════════════════════ */

import { USE_MOCKS } from '@/api/client';
import { userApi } from '@/api/userApi';
import type { MeDto, VehicleInfoDto, VehicleInput } from '@/api/userApi';
import { prefsStore } from './prefsStore';
import type { VehicleInfo } from './prefsStore';

export interface MyProfile {
  ratingAverage: number;
  ratingCount: number;
  /** The car as the server has it (or the local copy — see resolveVehicle). */
  vehicle: VehicleInfo | null;
}

/** Server shape → the app's VehicleInfo (null when there is no car). */
export function vehicleFromDto(dto: VehicleInfoDto | null | undefined): VehicleInfo | null {
  const model = (dto?.model || '').trim();
  if (!dto || !model) return null;
  const seats = Number(dto.seats);
  return {
    model,
    color: (dto.color || '').trim(),
    plate: (dto.plate || '').trim().toUpperCase(),
    seats: dto.seats != null && Number.isInteger(seats) && seats > 0 ? seats : null,
  };
}

/** The car to show for `me`. A structured car on the server wins. Without
    one, an empty `vehicle` means it was cleared (on any device); a legacy
    one-line `vehicle` (set before cars were structured) or demo mode keeps the
    local copy, the only structured details there are. */
export function resolveVehicle(me: Pick<MeDto, 'vehicle' | 'vehicleInfo'> | null | undefined): VehicleInfo | null {
  const fromServer = vehicleFromDto(me?.vehicleInfo);
  if (fromServer) return fromServer;
  if (USE_MOCKS || (me?.vehicle || '').trim()) return prefsStore.get().vehicle;
  return null;
}

const sameVehicle = (a: VehicleInfo | null, b: VehicleInfo | null): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const mirror = (vehicle: VehicleInfo | null): void => {
  if (!sameVehicle(prefsStore.get().vehicle, vehicle)) prefsStore.patch({ vehicle });
};

// Saves started / finished, and saves in flight: a load that overlapped one may
// carry the car from before it, and must not undo it.
let saveEpoch = 0;
let saving = 0;

/** GET /users/me → rating + car; refreshes the local car mirror. A response to a
    request that overlapped a save keeps the saved car (the server may have read
    the old one). */
export async function loadMyProfile(): Promise<MyProfile> {
  const epoch = saveEpoch;
  const overlapped = saving > 0;
  const me = await userApi.me();
  const stale = overlapped || saveEpoch !== epoch;
  const vehicle = stale ? prefsStore.get().vehicle : resolveVehicle(me);
  if (!stale) mirror(vehicle);
  return { ratingAverage: me?.ratingAverage || 0, ratingCount: me?.ratingCount || 0, vehicle };
}

/** Save (or clear, with null) the structured car. The local mirror changes
    only once the server accepted it — a failure throws and leaves it as it was. */
export async function saveVehicle(input: VehicleInput | null): Promise<VehicleInfo | null> {
  saving += 1;
  saveEpoch += 1;
  let res: Awaited<ReturnType<typeof userApi.updateVehicle>>;
  try {
    res = await userApi.updateVehicle(input);
  } finally {
    saving -= 1;
    saveEpoch += 1;
  }
  const sent = input ? vehicleFromDto({ model: input.model, color: input.color ?? null, plate: input.plate ?? null, seats: input.seats ?? null }) : null;
  const saved = vehicleFromDto(res?.vehicleInfo) || sent;
  mirror(saved);
  return saved;
}

/** Boot: bring the car mirror in line with the server (best-effort; the
    cached copy stays when offline). Demo mode keeps its local car. */
export function syncProfileMirror(): Promise<void> {
  if (USE_MOCKS) return Promise.resolve();
  return loadMyProfile().then(() => undefined);
}
