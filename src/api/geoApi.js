/* ════════════════════════════════════════════════════════════════
   REPOSITORY — geocoding & routing (live external services).
   Unlike the mock-backed repositories, these hit real public APIs
   (Nominatim + OSRM). Swap the endpoint constants to self-host or to a
   commercial provider without touching services/ or components/.
   ════════════════════════════════════════════════════════════════ */

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const OSRM = 'https://router.project-osrm.org';

export const geoApi = {
  /** Forward geocode: free-text query → candidate places. */
  async search(query) {
    const url = `${NOMINATIM}/search?format=json&q=${encodeURIComponent(query)}&limit=5&accept-language=uz,ru,en`;
    try {
      const r = await fetch(url, { headers: { 'Accept-Language': 'uz,ru,en' } });
      return await r.json();
    } catch { return []; }
  },

  /** Reverse geocode: [lat,lng] → raw Nominatim payload (or null on failure). */
  async reverse(latlng) {
    const url = `${NOMINATIM}/reverse?format=json&lat=${latlng[0]}&lon=${latlng[1]}&accept-language=uz,ru,en`;
    try {
      const r = await fetch(url, { headers: { 'Accept-Language': 'uz,ru,en' } });
      return await r.json();
    } catch { return null; }
  },

  /** OSRM driving route through an ordered list of [lat,lng] points. */
  async route(coords) {
    const coordStr = coords.map((c) => `${c[1]},${c[0]}`).join(';');
    const url = `${OSRM}/route/v1/driving/${coordStr}?overview=full&geometries=geojson&alternatives=2`;
    try {
      const r = await fetch(url);
      const d = await r.json();
      return d.routes || [];
    } catch { return []; }
  },
};
