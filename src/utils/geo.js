/* Geographic helpers — pure functions, no framework dependencies. */

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Great-circle distance between two [lat,lng] points, in kilometres. */
export const haversineKm = (a, b) => {
  if (!a || !b) return Infinity;
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
