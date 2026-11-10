/* ════════════════════════════════════════════════════════════════
   SERVICE — live walkers.
   Merges a WalkerProfileDto (REST /walkers/online) with a live
   WalkerPositionDto (PresenceHub) into the enriched walker shape the map
   + popup expect. Position-only — a route appears only if the walker
   publishes one.
   ════════════════════════════════════════════════════════════════ */

import { colorForId, initialsOf } from '@/utils/avatar';
import { idOf } from '@/utils/ids';
import type { LatLng } from '@/utils/geo';
import type { VehicleInfoDto } from '@/api/userApi';

export interface WalkerProfile {
  id: string | number;
  kind?: string;
  name?: string;
  vehicle?: string | null;
  rating?: number;
  photoUrl?: string | null;
  /** Driver: the active trip's seats ?? the vehicle's; passenger: null. */
  seats?: number | null;
  /** Completed trips as owner or confirmed companion. */
  completedTrips?: number;
  /** Completed trips this walker and the caller shared. */
  sharedTrips?: number;
  vehicleInfo?: VehicleInfoDto | null;
}
export interface WalkerPosition { lat: number; lng: number; heading?: number }

export interface LiveWalker {
  id: string;
  type: 'driver' | 'passenger';
  name: string;
  initials: string;
  color: string;
  vehicle: string | null;
  rating: number | null;
  photoUrl: string | null;
  /** A driver's free seats (informational); null for a passenger or unknown. */
  seats: number | null;
  /** Completed trips (the card's "N trips"). */
  trips: number;
  /** Completed trips shared with me (the card's "rode with you N×"). */
  sharedTrips: number;
  vehicleInfo: VehicleInfoDto | null;
  position: LatLng | null;
  heading: number | null;
  live: true;
  offline?: boolean;
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** Build the enriched walker the map renders + the popup formats. */
export function enrichLiveWalker(profile: WalkerProfile, pos?: WalkerPosition | null): LiveWalker {
  const type = profile.kind === 'driver' ? 'driver' : 'passenger';
  const seats = Number(profile.seats);
  return {
    id: idOf(profile.id),
    type,
    name: profile.name || 'Walker',
    initials: initialsOf(profile.name),
    color: colorForId(idOf(profile.id)),
    vehicle: profile.vehicle || null,
    rating: typeof profile.rating === 'number' ? profile.rating : null,
    photoUrl: profile.photoUrl || null,
    seats: type === 'driver' && profile.seats != null && Number.isInteger(seats) && seats > 0 ? seats : null,
    trips: count(profile.completedTrips),
    sharedTrips: count(profile.sharedTrips),
    vehicleInfo: type === 'driver' ? profile.vehicleInfo ?? null : null,
    position: pos ? [pos.lat, pos.lng] : null,
    heading: pos && Number.isFinite(pos.heading) ? (pos.heading as number) : null,
    live: true,
  };
}
