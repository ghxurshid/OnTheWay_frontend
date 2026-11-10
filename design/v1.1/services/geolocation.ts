/* SERVICE — one-shot device location (navigator.geolocation). */

import type { LatLng } from '@/utils/geo';

/** The device's current [lat,lng], or null if denied/unavailable. */
export function getCurrentLatLng(): Promise<LatLng | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve([p.coords.latitude, p.coords.longitude]),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 },
    );
  });
}
