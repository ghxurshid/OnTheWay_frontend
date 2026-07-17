/* ════════════════════════════════════════════════════════════════
   SERVICE — live walkers.
   Merges a WalkerProfileDto (REST /walkers/online) with a live
   WalkerPositionDto (PresenceHub) into the enriched walker shape the map
   + popup expect. Position-only — a route appears only if the walker
   publishes one.
   ════════════════════════════════════════════════════════════════ */

import type { LatLng } from '@/utils/geo';

const PALETTE = [
  '#1fc8c0', '#f0a832', '#a78bfa', '#ff5c72', '#2ecc8e',
  '#4d9fff', '#ff8a4d', '#e85ad6', '#5fd0e0', '#ffd24d',
];

/** Stable colour per user id (so a walker keeps the same colour across ticks). */
export function colorForId(id: string | number): string {
  const s = String(id || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function initialsOf(name?: string): string {
  if (!name) return '👤';
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

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
