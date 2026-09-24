/* SERVICE — geocoding. Wraps geoApi and shapes results for the UI
   (suggestion lists, human-readable reverse-geocode labels). */

import { geoApi } from '@/api/geoApi';
import type { LatLng } from '@/utils/geo';

/** A Nominatim search hit (only the fields the UI reads). */
export interface PlaceSuggestion { lat: string; lon: string; display_name: string }

/** The first `parts` comma-separated segments of a Nominatim display name. */
export const placeLabel = (displayName: string, parts = 2): string =>
  displayName.split(',').slice(0, parts).join(', ');

/** A suggestion → the [lat,lng] + short label a waypoint/field stores. */
export const suggestionToPlace = (s: PlaceSuggestion): { latlng: LatLng; label: string } => ({
  latlng: [parseFloat(s.lat), parseFloat(s.lon)],
  label: placeLabel(s.display_name),
});

/** Forward geocode → up to five candidate places. */
export async function geocode(query: string): Promise<PlaceSuggestion[]> {
  return ((await geoApi.search(query)) as PlaceSuggestion[]).slice(0, 5);
}

/** Reverse geocode → short human label, falling back to coordinates. */
export async function reverseGeocode(latlng: LatLng): Promise<string> {
  const d = await geoApi.reverse(latlng) as { display_name?: string } | null;
  return d?.display_name ? placeLabel(d.display_name, 3) : `${latlng[0].toFixed(4)}, ${latlng[1].toFixed(4)}`;
}
