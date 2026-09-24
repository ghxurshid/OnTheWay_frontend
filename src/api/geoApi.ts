/* ════════════════════════════════════════════════════════════════
   REPOSITORY — geocoding & routing (live external services).
   Unlike the mock-backed repositories, these hit real public APIs
   (Nominatim + OSRM). Swap the endpoint constants to self-host or to a
   commercial provider without touching services/ or components/.
   ════════════════════════════════════════════════════════════════ */

import type { LatLng } from '@/utils/geo';

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const OSRM = 'https://router.project-osrm.org';
const LANGS = 'uz,ru,en';

/** GET JSON, resolving to `fallback` on any network/parse failure. */
async function getJson<T>(url: string, fallback: T, init?: RequestInit): Promise<T> {
  try {
    const r = await fetch(url, init);
    return await r.json();
  } catch {
    return fallback;
  }
}

const nominatim = <T>(path: string, fallback: T) =>
  getJson<T>(`${NOMINATIM}${path}&accept-language=${LANGS}`, fallback, { headers: { 'Accept-Language': LANGS } });

export const geoApi = {
  /** Forward geocode: free-text query → candidate places. */
  search(query: string): Promise<unknown[]> {
    return nominatim(`/search?format=json&q=${encodeURIComponent(query)}&limit=5`, []);
  },

  /** Reverse geocode: [lat,lng] → raw Nominatim payload (or null on failure). */
  reverse([lat, lng]: LatLng): Promise<unknown> {
    return nominatim(`/reverse?format=json&lat=${lat}&lon=${lng}`, null);
  },

  /** OSRM driving route(s) through an ordered list of [lat,lng] points. */
  async route(coords: LatLng[], { alternatives = true } = {}): Promise<unknown[]> {
    const path = coords.map(([lat, lng]) => `${lng},${lat}`).join(';');
    const alt = alternatives ? '&alternatives=2' : '';
    const d = await getJson<{ routes?: unknown[] }>(
      `${OSRM}/route/v1/driving/${path}?overview=full&geometries=geojson${alt}`, {});
    return d.routes || [];
  },
};
