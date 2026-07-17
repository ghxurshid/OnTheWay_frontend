/* ════════════════════════════════════════════════════════════════
   useTripNavigation — active-route turn-by-turn navigation.
   ────────────────────────────────────────────────────────────────
   Owns the navigation machinery (real-GPS watch or mock tween, the
   per-frame progress/ETA update, start/stop/end) and its private refs.
   The activeRoute / navProgress *state* stays in App (read by the map
   chrome and by useHeadingFollow), so setters are injected here.

   Heading-up follow during a trip is delegated back to the shared follow
   frame (applyFollow) — hence the follow refs are passed in.
   ════════════════════════════════════════════════════════════════ */

import { useRef } from 'react';
import WalkerSim from '@/services/simulationService';
import { USE_MOCKS } from '@/api/client';
import { haversineKm } from '@/utils/geo';
import { presenceClient } from '@/services/realtime';
import { tripApi } from '@/api/tripApi';
import { walkerStateStore } from '@/services/walkerStateStore';

const Sim = WalkerSim;

export function useTripNavigation({
  mapHook, userLocRef, applyFollow, followMeRef, lastHeadingRef,
  activeRouteRef, liveTripIdRef, setActiveRoute, setNavProgress,
}) {
  const navTimerRef = useRef(null);    // mock-mode simulated-nav interval
  const navWatchRef = useRef(null);    // navigator.geolocation.watchPosition id
  const lastRealPosRef = useRef(null); // previous real fix (heading fallback)
  const navSpeedRef = useRef(0);       // smoothed real speed (km/h)
  const navProgRef = useRef(0);

  // Stop every navigation source (the real GPS watch and the mock-mode tween).
  const stopNav = () => {
    if (navTimerRef.current) { clearInterval(navTimerRef.current); navTimerRef.current = null; }
    if (navWatchRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(navWatchRef.current);
    }
    navWatchRef.current = null;
  };

  // Render one navigation frame: advance progress (monotonic), redraw traveled/
  // remaining, point the "me" marker along the heading, refresh the live ETA.
  const applyNav = (rawProgress, markerPos, heading, speedKmh) => {
    const base = activeRouteRef.current; if (!base) return;
    const { coords } = base;
    const p = Math.max(navProgRef.current, Math.min(1, rawProgress));
    navProgRef.current = p;
    const s = Sim.splitRoute(coords, p);
    mapHook.updateUserRoute(s.traveled, s.remaining);
    let hd = heading;
    if (hd == null) {
      if (s.remaining && s.remaining.length >= 2) hd = Sim.bearing(s.remaining[0], s.remaining[1]);
      else if (s.traveled && s.traveled.length >= 2) hd = Sim.bearing(s.traveled[s.traveled.length - 2], s.traveled[s.traveled.length - 1]);
    }
    const pos = markerPos || s.position;
    if (pos) {
      // Follow works during an active trip too: remember the heading and rotate
      // heading-up + recenter; otherwise just point the marker along the heading.
      if (hd != null) lastHeadingRef.current = hd;
      if (followMeRef.current) applyFollow(pos, speedKmh);
      else mapHook.setUserLocation(pos, hd);
    }
    const remKm = Math.max(0, base.distanceKm * (1 - p));
    const liveEta = speedKmh && speedKmh > 3
      ? { remMin: Math.round((remKm / speedKmh) * 60), remKm: remKm.toFixed(1) }
      : null;
    setActiveRoute(liveEta ? { ...base, liveEta } : base);
    setNavProgress(p);
    if (p >= 0.999) stopNav();
  };

  // Real device navigation: project each GPS fix onto the route, deriving speed
  // and heading from the device where available and from movement otherwise.
  const onRealFix = (position) => {
    const base = activeRouteRef.current; if (!base) return;
    const real = [position.coords.latitude, position.coords.longitude];
    const { progress } = Sim.projectOnRoute(base.coords, real);
    const speedMps = position.coords.speed != null && position.coords.speed >= 0 ? position.coords.speed : null;
    const speedKmh = speedMps != null ? speedMps * 3.6 : null;
    if (speedKmh != null) navSpeedRef.current += (speedKmh - navSpeedRef.current) * 0.4; // light smoothing

    let heading = null;
    const gpsHeading = position.coords.heading;
    if (gpsHeading != null && !Number.isNaN(gpsHeading) && (speedMps == null || speedMps > 0.5)) {
      heading = gpsHeading; // device compass/course, trustworthy while actually moving
    } else if (lastRealPosRef.current && haversineKm(lastRealPosRef.current, real) > 0.003) {
      heading = Sim.bearing(lastRealPosRef.current, real); // derive from real movement
    }
    lastRealPosRef.current = real;
    applyNav(progress, real, heading, navSpeedRef.current || speedKmh || null);
  };

  // Mock/demo mode only: no real movement exists, so animate the demo tween.
  const startSimulatedNav = (coords, distanceKm) => {
    if (navTimerRef.current) return;
    const intervalMs = 500;
    const demoMs = Math.min(360000, Math.max(150000, distanceKm * 150000));
    const stepInc = intervalMs / demoMs;
    navTimerRef.current = setInterval(() => {
      applyNav(navProgRef.current + stepInc, null, null, null);
    }, intervalMs);
  };

  const startUserNav = (route, coords) => {
    stopNav();
    navProgRef.current = 0;
    navSpeedRef.current = 0;
    lastRealPosRef.current = null;
    setNavProgress(0);
    const distanceKm = route.distance / 1000;
    const durationMin = route.duration / 60;
    const ar = { coords, distanceKm, durationMin };
    activeRouteRef.current = ar;
    setActiveRoute(ar);

    // Mock/demo mode has no real movement — animate the tween.
    if (USE_MOCKS) { startSimulatedNav(coords, distanceKm); return; }

    // Live mode: drive navigation only from the device's real GPS. There is no
    // simulation fallback — if geolocation is unavailable/denied the route
    // simply stays at 0% until real fixes start arriving.
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navWatchRef.current = navigator.geolocation.watchPosition(
      onRealFix,
      () => { /* denied / unavailable → wait for a real fix, no simulation */ },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
  };

  const endRoute = () => {
    stopNav();
    if (!USE_MOCKS) {
      presenceClient.clearRoute().catch(() => {});
      // Ending the route finishes the persisted Live trip (accepted bookings
      // complete, pending ones expire). Only the live trip backing THIS route —
      // a separately-scheduled planned trip must not be completed here.
      const liveTripId = liveTripIdRef.current;
      if (liveTripId) {
        liveTripIdRef.current = null;
        tripApi.complete(liveTripId).catch(() => {});
        if (walkerStateStore.get().activeTripId === liveTripId) {
          walkerStateStore.patch({ clearActiveTrip: true });
        }
      }
    }
    mapHook.clearUserRoute();
    mapHook.clearPlanning();
    activeRouteRef.current = null;
    navProgRef.current = 0;
    setActiveRoute(null);
    setNavProgress(0);
    if (userLocRef.current) mapHook.setUserLocation(userLocRef.current);
  };

  return { startUserNav, stopNav, endRoute };
}
