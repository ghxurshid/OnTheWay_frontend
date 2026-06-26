/* ════════════════════════════════════════════════════════════════
   REALTIME SESSION — connects all hubs after authentication and streams
   the device's own location into presence. One entry point the app calls
   once it has a valid session; safe to call again (idempotent connects).
   ════════════════════════════════════════════════════════════════ */

import { presenceClient } from './presenceClient';
import { chatClient } from './chatClient';
import { callClient } from './callClient';

export { presenceClient, chatClient, callClient };

let geoWatchId = null;

/** Connect every hub. Failures are isolated so one hub down doesn't block others. */
export async function connectRealtime() {
  await Promise.allSettled([
    presenceClient.connect(),
    chatClient.connect(),
    callClient.connect(),
  ]);
}

/**
 * Begin streaming the device position into presence (so others see us move).
 * Requires geolocation permission; silently no-ops if denied/unavailable.
 */
export function startLocationReporting() {
  if (geoWatchId !== null || typeof navigator === 'undefined' || !navigator.geolocation) return;
  geoWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, heading } = pos.coords;
      presenceClient.updateLocation(latitude, longitude, Number.isFinite(heading) ? heading : null);
    },
    () => { /* permission denied / unavailable — presence still works, just no self-position */ },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
  );
}

export function stopLocationReporting() {
  if (geoWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null;
  }
}

/** Tear everything down (logout / unmount). */
export async function disconnectRealtime() {
  stopLocationReporting();
  await Promise.allSettled([
    presenceClient.disconnect(),
    chatClient.disconnect(),
    callClient.disconnect(),
  ]);
}
