import type { LatLng, PartyType } from '@/models';

/** A person shown on the map, in the list view and on their card — the shape
    App's `formatForPopup` builds from a simulated or live walker. */
export interface MapPerson {
  id: string;
  type: PartyType;
  initials: string;
  name: string;
  color?: string;
  /** Vehicle (drivers) or "going your way" (passengers). */
  sub?: string;
  dist?: string;
  eta?: string;
  distKm?: number | null;
  etaMin?: number | null;
  rating?: number | string;
  trips?: number;
  /** Completed trips this person and I shared ("rode with you N×"). */
  sharedTrips?: number;
  latlng?: LatLng | null;
  /** Route-match percentage, when the matcher computed one. */
  match?: number;
  offline?: boolean;
  vehicle?: string | null;
  seats?: number | null;
  startLatlng?: LatLng | null;
  destLatlng?: LatLng | null;
  note?: string | null;
}

/** Best match first, then nearest. */
export const byMatchThenDistance = (a: MapPerson, b: MapPerson): number =>
  (b.match ?? -1) - (a.match ?? -1) || (a.distKm ?? 1e9) - (b.distKm ?? 1e9);
