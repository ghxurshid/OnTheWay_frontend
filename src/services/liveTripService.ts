/* ════════════════════════════════════════════════════════════════
   SERVICE — the Live trip behind an on-map route.
   The route is persisted as a Live trip so the session survives app
   restarts (and the abandoned-session sweeper can close it if the walker
   vanishes), and closed when the route ends or the walker leaves the map.
   Best-effort throughout: the live map keeps working if a call fails.
   ════════════════════════════════════════════════════════════════ */

import { USE_MOCKS } from '@/api/client';
import { tripApi } from '@/api/tripApi';
import { presenceClient } from '@/services/realtime';
import { walkerStateStore } from '@/services/walkerStateStore';
import { tripOutbox } from '@/services/tripOutbox';
import type { OsrmRoute } from '@/services/routeService';
import type { LatLng, PartyType } from '@/models';
import { readJson, writeJson } from '@/utils/storage';

// People the walker agreed to ride with during this journey ("ride together"
// accepted by both in a call). Recorded as the trip's companions when it is
// completed — the source of the partner's history, ratings and statistics.
const COMPANIONS_KEY = 'ontheway_ride_companions_v1';

/** Remember an agreed companion for the current journey. */
export function recordCompanion(userId: string): void {
  const ids = readJson<string[]>(COMPANIONS_KEY, []);
  if (!ids.includes(userId)) writeJson(COMPANIONS_KEY, [...ids, userId]);
}

const takeCompanions = (): string[] => {
  const ids = readJson<string[]>(COMPANIONS_KEY, []);
  writeJson(COMPANIONS_KEY, null);
  return ids;
};

/** A picked route endpoint (label + coordinate), as the route sheet emits it. */
export interface RouteWaypoint { value?: string; latlng?: LatLng | null }

/** Persists the drawn route as a Live trip and records it as the session's
    active trip. Resolves to the trip id, or null if persisting failed. */
export async function createLiveTrip(route: OsrmRoute, coords: LatLng[], waypoints: RouteWaypoint[],
  role: PartyType): Promise<string | null> {
  try {
    const points = waypoints.filter((w) => w?.latlng);
    const from = points[0];
    const to = points[points.length - 1];
    const [oLat, oLng] = from?.latlng || coords[0];
    const [dLat, dLng] = to?.latlng || coords[coords.length - 1];
    const trip = await tripApi.create({
      origin: { latitude: oLat, longitude: oLng, address: from?.value || '' },
      destination: { latitude: dLat, longitude: dLng, address: to?.value || '' },
      departureTimeUtc: new Date().toISOString(),
      distanceKm: route.distance ? route.distance / 1000 : null,
      estimatedMinutes: route.duration ? Math.round(route.duration / 60) : null,
      notes: null,
      category: 'Live',
      role: role === 'driver' ? 'Driver' : 'Passenger',
    });
    if (trip?.id == null) return null;
    const id = String(trip.id);
    walkerStateStore.patch({ activeTripId: id });
    return id;
  } catch (e) {
    console.warn('[trip] live trip persist failed:', (e as Error)?.message || e);
    return null;
  }
}

/** Withdraws the shared route and closes the Live trip behind it — completed
    when the route ends, cancelled when the walker abandons the map. The close
    goes through the trip outbox, so it lands even if the network is down now. */
export function closeLiveTrip(tripId: string | null, outcome: 'complete' | 'cancel'): void {
  const companions = takeCompanions();
  if (USE_MOCKS) return;
  presenceClient.clearRoute().catch(() => {});
  if (!tripId) return;
  tripOutbox.enqueue(outcome === 'complete'
    ? { kind: 'complete', tripId, companionIds: companions }
    : { kind: 'cancel', tripId });
  if (walkerStateStore.get().activeTripId === tripId) walkerStateStore.patch({ clearActiveTrip: true });
}

/** "Band/to'ldi": withdraw from (or return to) discovery — the session flag,
    the live presence, and the trip's visibility when one is given. */
export function publishBanded(banded: boolean, tripId: string | null): void {
  walkerStateStore.patch({ engaged: banded });
  if (USE_MOCKS) return;
  (banded ? presenceClient.markEngaged() : presenceClient.markAvailable()).catch(() => {});
  if (tripId) tripOutbox.enqueue({ kind: banded ? 'hide' : 'show', tripId });
}
