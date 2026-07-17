/* ════════════════════════════════════════════════════════════════
   useHeadingFollow — live-location tracking + heading-up follow mode.
   ────────────────────────────────────────────────────────────────
   Extracted from App.jsx as the first step of decomposing that God
   Component: this hook owns everything about "watch my location and,
   when the compass is on, keep me centered / rotated heading-up / zoomed".

   Heading comes ONLY from movement (GPS course, or bearing between fixes)
   gated on speed, so a parked device never spins the map; the last real
   heading is held while parked, defaulting to north-up until one is seen.

   It returns { applyFollow, lastHeadingRef } so trip navigation (which owns
   the marker while a route is active) can reuse the same follow frame.
   ════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import { haversineKm } from '@/utils/geo';
import type { LatLng } from '@/utils/geo';
import { bearing } from '@/services/simulationService';
import type { MapHook } from './mapHook';

// Bearing used before any real heading has been observed (north up).
export const DEFAULT_HEADING = 0;

interface UseHeadingFollowArgs {
  mapHook: MapHook;
  screen: string;
  activeRoute: unknown;
  followMe: boolean;
  setFollowMe: Dispatch<SetStateAction<boolean>>;
  userLocRef: MutableRefObject<LatLng | null>;
}

// Balanced follow-zoom: the faster you move the further ahead you see.
// Discrete steps (with navFollow's 0.5 threshold) avoid re-zoom jitter.
export function zoomForSpeed(kmh: number | null | undefined): number {
  if (kmh == null || Number.isNaN(kmh)) return 17;
  if (kmh < 5) return 17;   // stationary / walking
  if (kmh < 20) return 16;  // slow
  if (kmh < 45) return 15;  // city driving
  return 14;                // fast
}

/**
 * @param {object}   opts
 * @param {object}   opts.mapHook     the imperative map controller (stable)
 * @param {string}   opts.screen      current screen id ('map' activates tracking)
 * @param {*}        opts.activeRoute  truthy while a trip owns the marker (pauses this watch)
 * @param {boolean}  opts.followMe    compass/heading-up mode on
 * @param {Function} opts.setFollowMe releases follow when the user grabs the map
 * @param {object}   opts.userLocRef  shared ref the app reads the live location from
 */
export function useHeadingFollow({ mapHook, screen, activeRoute, followMe, setFollowMe, userLocRef }: UseHeadingFollowArgs) {
  const followMeRef = useRef(false);   // read inside watch callbacks
  const lastHeadingRef = useRef<number | null>(null); // last real heading from movement (frozen while parked)

  // Apply one "heading-up" follow frame: recenter, rotate to the (remembered)
  // heading, hold a speed-balanced zoom, and lock the "me" arrow pointing up.
  const applyFollow = useCallback((pos: LatLng, kmh: number | null) => {
    if (!followMeRef.current || !pos) return;
    mapHook.setUserLocation(pos, 0); // arrow forward = screen up (map carries heading)
    mapHook.rotateTo(lastHeadingRef.current != null ? lastHeadingRef.current : DEFAULT_HEADING);
    mapHook.navFollow(pos, zoomForSpeed(kmh));
  }, [mapHook]);

  // Always-on location tracking (paused while a trip owns the marker).
  useEffect(() => {
    if (screen !== 'map' || activeRoute) return undefined;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return undefined;
    let lastPos: LatLng | null = null;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const pos: LatLng = [p.coords.latitude, p.coords.longitude];
        const spd = p.coords.speed;
        const kmh = spd != null && !Number.isNaN(spd) && spd >= 0 ? spd * 3.6 : null;
        // Only trust a heading when speed confirms real movement — a parked GPS
        // wandering ±5-10m must not produce a heading (the map would spin).
        let heading: number | null = null;
        const gh = p.coords.heading;
        const movingBySpeed = kmh != null && kmh >= 3;
        if (movingBySpeed && gh != null && !Number.isNaN(gh)) heading = gh;
        else if (movingBySpeed && lastPos && haversineKm(lastPos, pos) > 0.006) heading = bearing(lastPos, pos);
        else if (kmh == null && lastPos && haversineKm(lastPos, pos) > 0.012) heading = bearing(lastPos, pos);
        if (heading != null) lastHeadingRef.current = heading; // remember for parked frames
        lastPos = pos;
        userLocRef.current = pos;
        if (followMeRef.current) applyFollow(pos, kmh);
        else mapHook.setUserLocation(pos, heading);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
    // Grabbing the map by hand releases follow so panning stays free.
    const offDrag = mapHook.onUserDrag(() => { if (followMeRef.current) setFollowMe(false); });
    return () => { navigator.geolocation.clearWatch(id); offDrag(); };
  }, [screen, activeRoute]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mirror followMe into a ref and react to toggles: on → snap to the live
  // location; off → straighten north-up and restore the free-pointing arrow.
  useEffect(() => {
    followMeRef.current = followMe;
    if (followMe) {
      if (userLocRef.current) applyFollow(userLocRef.current, null);
    } else {
      mapHook.setBearing(0); // straighten north-up instantly
      if (userLocRef.current) mapHook.setUserLocation(userLocRef.current, null);
    }
  }, [followMe]); // eslint-disable-line react-hooks/exhaustive-deps

  return { applyFollow, lastHeadingRef, followMeRef };
}
