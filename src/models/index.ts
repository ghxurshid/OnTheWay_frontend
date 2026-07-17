/* ════════════════════════════════════════════════════════════════
   DOMAIN MODELS — the shapes flowing UI ← hook ← service ← api ← mock.
   A single place to evolve the data contract as more of the app moves
   to TypeScript. (Ported from the previous JSDoc typedefs.)
   ════════════════════════════════════════════════════════════════ */

import type { LatLng } from '@/utils/geo';

export type { LatLng };

export type PartyType = 'driver' | 'passenger';

/** A scheduled walker (driver or passenger). */
export interface Walker {
  id: string;
  type: PartyType;
  name: string;
  initials: string;
  from: string;
  to: string;
  fromLatlng: LatLng;
  toLatlng: LatLng;
  when: Date;
  seats: number;
  rating: number;
  vehicle: string | null;
}

/** A contact the user has saved. */
export interface Contact {
  id: string;
  name: string;
  initials: string;
  type: PartyType;
  rating: number;
  phone: string;
  online: boolean;
  lastSeen: string | null;
  latlng: LatLng;
  hasRoute: boolean;
  fromLatlng?: LatLng;
  toLatlng?: LatLng;
  vehicle?: string;
}

/** A completed trip. */
export interface Trip {
  id: string;
  from: string;
  to: string;
  date: Date;
  duration: string;
  km: string;
  role: PartyType;
  partner: string;
  rating: number;
  status: 'completed' | 'cancelled';
}

/** A normalized route returned by the route service / RouteServer. */
export interface RouteData {
  coords: LatLng[];
  distanceKm: number;
  durationMin: number;
}

/** The active trip route driving the on-map navigation bar. */
export interface ActiveRoute {
  coords?: LatLng[];
  distanceKm: number;
  durationMin: number;
  liveEta?: { remMin: number; remKm: string } | null;
}

/** A transient push-notification toast payload. */
export interface PushNotif {
  title: string;
  body: string;
  user?: { id?: string; type?: PartyType; name?: string; initials?: string; sub?: string; latlng?: LatLng };
  chat?: boolean;
  action?: string;
  duration?: number;
}

/** A saved item (place / route / partner). */
export interface SavedItem {
  id: string;
  type: 'place' | 'route' | 'partner';
  label: string;
  sub?: string;
  initials?: string;
  savedAt?: number;
}
