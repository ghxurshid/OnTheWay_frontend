/* SERVICE — geocoding. Wraps geoApi and shapes results for the UI
   (suggestion lists, human-readable reverse-geocode labels). Every label is
   localized (utils/placeName): Cyrillic OSM names are transliterated for the
   Latin-script UI languages, and kept short (street + area). */

import { geoApi } from '@/api/geoApi';
import { localizePlace, shortPlaceName } from '@/utils/placeName';
import type { AddressParts } from '@/utils/placeName';
import type { LatLng } from '@/utils/geo';

/** A Nominatim search hit (only the fields the UI reads). */
export interface PlaceSuggestion { lat: string; lon: string; display_name: string; address?: AddressParts }

/** The first `parts` comma-separated segments of a Nominatim display name. */
export const placeLabel = (displayName: string, parts = 2): string =>
  localizePlace(displayName.split(',').slice(0, parts).map((p) => p.trim()).join(', '));

/** A suggestion → the [lat,lng] + short label a waypoint/field stores. */
export const suggestionToPlace = (s: PlaceSuggestion): { latlng: LatLng; label: string } => ({
  latlng: [parseFloat(s.lat), parseFloat(s.lon)],
  label: shortPlaceName(s.display_name, s.address) || placeLabel(s.display_name),
});

/** Forward geocode → up to five candidate places. Throws when the service fails. */
export async function geocode(query: string): Promise<PlaceSuggestion[]> {
  return ((await geoApi.search(query)) as PlaceSuggestion[]).slice(0, 5)
    .map((s) => ({ ...s, display_name: localizePlace(s.display_name) }));
}

/** Reverse geocode → the same short label a picked suggestion gets, falling back to
    coordinates when the service has no answer (a label is a nicety — never
    block on it). */
export async function reverseGeocode(latlng: LatLng): Promise<string> {
  const d = await geoApi.reverse(latlng).catch(() => null) as { display_name?: string; address?: AddressParts } | null;
  return shortPlaceName(d?.display_name, d?.address) || (d?.display_name ? placeLabel(d.display_name, 2)
    : `${latlng[0].toFixed(4)}, ${latlng[1].toFixed(4)}`);
}
