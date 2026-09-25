/* ════════════════════════════════════════════════════════════════
   REPOSITORY — geocoding & routing.
   Live mode goes through the API's /geo proxy (cached, rate-limited, one
   identifiable client — the public OSM services forbid heavy/autocomplete
   use from browsers). Mock/demo mode, which has no backend, calls the public
   Nominatim/OSRM endpoints directly. Failures THROW (ApiError) so screens can
   say "the service is down, retry" instead of "no results".
   ════════════════════════════════════════════════════════════════ */

import { ApiError, USE_MOCKS, http } from './client';
import { i18nStore } from '@/i18n';
import type { LatLng } from '@/utils/geo';

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const OSRM = 'https://router.project-osrm.org';
const TIMEOUT_MS = 12_000;

const langs = (): string => [i18nStore.mode, ...['uz', 'ru', 'en'].filter((l) => l !== i18nStore.mode)].join(',');

/** Direct public call (demo mode only), with a timeout and ApiError on failure. */
async function publicJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: controller.signal, headers: { 'Accept-Language': langs() } });
    if (!r.ok && r.status !== 400) throw new ApiError(r.status, `HTTP ${r.status}`);
    return await r.json() as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, (e as Error)?.message || 'Network request failed.', [],
      controller.signal.aborted ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
}

const enc = encodeURIComponent;

export const geoApi = {
  /** Forward geocode: free-text query → up to five candidate places. */
  search(query: string): Promise<unknown[]> {
    if (USE_MOCKS) return publicJson(`${NOMINATIM}/search?format=json&q=${enc(query)}&limit=5&accept-language=${langs()}`);
    return http(`/geo/search?q=${enc(query)}&lang=${i18nStore.mode}`, { timeoutMs: TIMEOUT_MS });
  },

  /** Reverse geocode: [lat,lng] → Nominatim payload ({ display_name }). */
  reverse([lat, lng]: LatLng): Promise<unknown> {
    if (USE_MOCKS) return publicJson(`${NOMINATIM}/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=${langs()}`);
    return http(`/geo/reverse?lat=${lat}&lng=${lng}&lang=${i18nStore.mode}`, { timeoutMs: TIMEOUT_MS });
  },

  /** Driving route(s) through an ordered list of [lat,lng] points (empty when no road route exists). */
  async route(coords: LatLng[], { alternatives = true } = {}): Promise<unknown[]> {
    if (USE_MOCKS) {
      const path = coords.map(([lat, lng]) => `${lng},${lat}`).join(';');
      const d = await publicJson<{ routes?: unknown[] }>(
        `${OSRM}/route/v1/driving/${path}?overview=full&geometries=geojson${alternatives ? '&alternatives=2' : ''}`);
      return d.routes || [];
    }
    const points = coords.map(([lat, lng]) => `${lat},${lng}`).join(';');
    const d = await http<{ routes?: unknown[] }>(`/geo/route?points=${enc(points)}&alternatives=${alternatives}`,
      { timeoutMs: TIMEOUT_MS });
    return d?.routes || [];
  },
};
