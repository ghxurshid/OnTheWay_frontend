/* SERVICE — geocoding. Wraps geoApi and shapes results for the UI
   (suggestion lists, human-readable reverse-geocode labels). */

import { geoApi } from '@/api/geoApi';
import type { LatLng } from '@/utils/geo';

/** Forward geocode → raw candidate list (UI maps over display_name/lat/lon). */
export function geocode(query: string) {
  return geoApi.search(query);
}

/** Reverse geocode → short human label, falling back to coordinates. */
export async function reverseGeocode(latlng: LatLng): Promise<string> {
  let label = `${latlng[0].toFixed(4)}, ${latlng[1].toFixed(4)}`;
  const d = await geoApi.reverse(latlng) as { display_name?: string } | null;
  if (d && d.display_name) label = d.display_name.split(',').slice(0, 3).join(', ');
  return label;
}
