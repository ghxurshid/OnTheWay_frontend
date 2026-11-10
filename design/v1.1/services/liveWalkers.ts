/* ════════════════════════════════════════════════════════════════
   SERVICE — live walkers.
   Merges a WalkerProfileDto (REST /walkers/online) with a live
   WalkerPositionDto (PresenceHub) into the enriched walker shape the map
   + popup expect. Position-only — a route appears only if the walker
   publishes one.
   ════════════════════════════════════════════════════════════════ */

import { colorForId, initialsOf } from '@/utils/avatar';
import type { LatLng } from '@/utils/geo';

export interface WalkerProfile {
  id: string | number;
  kind?: string;
  name?: string;
  vehicle?: string | null;
  rating?: number;
  photoUrl?: string | null;
}
export interface WalkerPosition { lat: number; lng: number; heading?: number }

export interface LiveWalker {
  id: string | number;
  type: 'driver' | 'passenger';
  name: string;
  initials: string;
  color: string;
  vehicle: string | null;
  rating: number | null;
  photoUrl: string | null;
  position: LatLng | null;
  heading: number | null;
  live: true;
  offline?: boolean;
}

/** Build the enriched walker the map renders + the popup formats. */
export function enrichLiveWalker(profile: WalkerProfile, pos?: WalkerPosition | null): LiveWalker {
  return {
    id: profile.id,
    type: profile.kind === 'driver' ? 'driver' : 'passenger',
    name: profile.name || 'Walker',
    initials: initialsOf(profile.name),
    color: colorForId(profile.id),
    vehicle: profile.vehicle || null,
    rating: typeof profile.rating === 'number' ? profile.rating : null,
    photoUrl: profile.photoUrl || null,
    position: pos ? [pos.lat, pos.lng] : null,
    heading: pos && Number.isFinite(pos.heading) ? (pos.heading as number) : null,
    live: true,
  };
}
