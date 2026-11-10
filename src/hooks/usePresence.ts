/* ════════════════════════════════════════════════════════════════
   usePresence — render real online walkers from the presence hub.
   ────────────────────────────────────────────────────────────────
   The live-map counterpart to the mock simulation: subscribes to the
   presence hub, keeps the per-walker marker/route layers in sync
   (join / move / gone / route-published / offline-grace), refreshes
   profiles, and focuses the map on entry.

   People I blocked never appear (the server already keeps a blocked pair
   off each other's maps; this hides them at once and is the safety net).
   A shared route's endpoints ride on the walker entry (`start` / `dest`
   + labels), so the card can show where they are going, and so does its
   line (`routePoints`), for the route match.

   Shared app pieces are injected (map controller, the live-walker ref,
   openWalker popup opener, the toast `notify` sink, and
   the auto-resume hook for a retained trip) — the coupling mirrors the
   real data flow rather than hiding it.
   ════════════════════════════════════════════════════════════════ */

import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { t } from '@/i18n';
import { USE_MOCKS } from '@/api/client';
import { TASHKENT } from '@/constants/map';
import { haversineKm } from '@/utils/geo';
import type { LatLng } from '@/utils/geo';
import { presenceClient } from '@/services/realtime';
import { enrichLiveWalker } from '@/services/liveWalkers';
import { BLOCK_EVENT, blockStore } from '@/services/blockStore';
import { walkerAlertService } from '@/services/walkerAlertService';
import { getCurrentLatLng } from '@/services/geolocation';
import { colorForId } from '@/utils/avatar';
import { walkerApi } from '@/api/walkerApi';
import type { MapHook } from './mapHook';

type Any = any;

interface UsePresenceArgs {
  screen: string;
  mode: string | null;
  mapHook: MapHook;
  liveWalkersRef: MutableRefObject<Map<Any, Any>>;
  userLocRef: MutableRefObject<LatLng | null>;
  openWalker: (id: string) => void;
  notify: (n: { title: string; body: string }) => void;
  restoreLiveRoute: (trip: Any) => void;
  pendingRestoreRef: MutableRefObject<Any>;
  /** The device location could not be read (the map is not centred on the user). */
  onLocationUnknown: () => void;
  /** The device location is known (the "you" marker is placed). */
  onLocated: (loc: LatLng) => void;
  /** Number of opposite-role walkers currently on the map (after each refresh). */
  onWalkerCount: (n: number) => void;
}

/** Walkers farther than this are still drawn, but neither zoom the map out on
    entry nor raise "joined" toasts — they are not practically "nearby". */
const NEARBY_KM = 20;

/** With "tell me when someone appears" on, a nearby walker's "joined" toast waits
    this long: the server sends WalkerAlertFired right after WalkerJoined, and when
    this walker set the alert off, its toast says it already. */
const JOINED_TOAST_DEFER_MS = 400;

/** Where a walker's shared route starts and ends (ActiveRouteDto endpoints), and the
    line between them (null when too short to be one), which the route match reads. */
interface RouteEnds { start: LatLng; dest: LatLng; startLabel: string | null; destLabel: string | null; routePoints: LatLng[] | null }

const pointOf = (p: Any): LatLng | null =>
  p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? [p.lat, p.lng] : null;

/** The endpoints of a published route (its origin/destination, else the polyline's ends). */
export function routeEndsOf(active: Any): RouteEnds | null {
  const points = (active?.points || []) as Any[];
  const start = pointOf(active?.origin) || pointOf(points[0]);
  const dest = pointOf(active?.destination) || pointOf(points[points.length - 1]);
  if (!start || !dest) return null;
  const line = points.map(pointOf).filter((p): p is LatLng => p !== null);
  return {
    start, dest, startLabel: active.originLabel || null, destLabel: active.destinationLabel || null,
    routePoints: line.length >= 2 ? line : null,
  };
}

export function usePresence({
  screen, mode, mapHook, liveWalkersRef, userLocRef, openWalker, notify,
  restoreLiveRoute, pendingRestoreRef, onLocationUnknown, onLocated, onWalkerCount,
}: UsePresenceArgs) {
  useEffect(() => {
    if (USE_MOCKS || screen !== 'map' || !mode) return undefined;
    let alive = true;
    const profiles = new Map<string, Any>(); // userId → WalkerProfileDto
    const profileRequested = new Set<string>(); // ids a refresh was scheduled for
    const routeEnds = new Map<string, RouteEnds>(); // userId → their shared route's endpoints
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const oppositeRole = mode === 'driver' ? 'passenger' : 'driver';

    /** A fresh walker entry from profile + position, with their route's endpoints. */
    const walkerFor = (profile: Any, pos: Any) => {
      const w: Any = enrichLiveWalker(profile, pos);
      const ends = routeEnds.get(w.id);
      if (ends) Object.assign(w, ends);
      return w;
    };

    const render = () => {
      if (!alive) return;
      const positions = presenceClient.getPositions();
      const seen = new Set();
      let missingProfile = false;
      positions.forEach((pos) => {
        if (pos.role && pos.role !== oppositeRole) return; // stale other-role entry
        if (blockStore.has(pos.userId)) return; // dropped below, with the route
        const profile = profiles.get(pos.userId);
        if (!profile) {
          // E.g. joined while we were offline: fetch the profile once, then draw.
          if (!profileRequested.has(pos.userId)) { profileRequested.add(pos.userId); missingProfile = true; }
          return;
        }
        const w = walkerFor(profile, pos);
        const prev = liveWalkersRef.current.get(w.id);
        if (prev && prev.offline) w.offline = true; // keep the greyed state
        liveWalkersRef.current.set(w.id, w);
        seen.add(w.id);
        mapHook.upsertWalkerMarker(w, openWalker);
      });
      // Drop walkers that are gone / no longer positioned — with their routes.
      [...liveWalkersRef.current.keys()].forEach((id) => {
        if (seen.has(id)) return;
        liveWalkersRef.current.delete(id);
        mapHook.removeWalkerRoute(id);
        mapHook.removeWalkerMarker(id);
      });
      reportCount();
      if (missingProfile) scheduleRefresh();
    };
    const reportCount = () => {
      if (alive) onWalkerCount([...liveWalkersRef.current.keys()].filter((id) => !blockStore.has(id)).length);
    };

    const refresh = async () => {
      try {
        const list = await walkerApi.online(mode); // server returns only the opposite role
        if (!alive) return;
        // Merge, don't clear: a disconnected walker in the offline-grace window
        // keeps their (greyed) marker, so their profile must survive refreshes
        // that no longer list them.
        list.forEach((p: Any) => profiles.set(p.id, p));
        render();
      } catch { /* keep whatever we have */ }
    };
    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => { refreshTimer = null; refresh(); }, 800);
    };

    const onMoved = (pos: Any) => {
      if (!alive || (pos.role && pos.role !== oppositeRole)) return; // in flight across a role switch
      if (blockStore.has(pos.userId)) return;
      if (!profiles.has(pos.userId)) { scheduleRefresh(); return; }
      const w = walkerFor(profiles.get(pos.userId), pos);
      const isNew = !liveWalkersRef.current.has(w.id);
      liveWalkersRef.current.set(w.id, w);
      mapHook.upsertWalkerMarker(w, openWalker);
      if (isNew) reportCount();
    };
    const onGone = (id: Any) => {
      if (!alive) return;
      routeEnds.delete(String(id)); // a returning walker's route comes with their marker again
      liveWalkersRef.current.delete(id);
      mapHook.removeWalkerRoute(id);
      mapHook.removeWalkerMarker(id);
      reportCount();
    };

    // Offline grace: a disconnected walker STAYS on the map — marker and route
    // greyed — until they return or the server sweeps them (WalkerGone).
    const onUserOffline = (id: Any) => {
      if (!alive) return;
      const w = liveWalkersRef.current.get(String(id));
      if (w) { w.offline = true; mapHook.setWalkerOffline(String(id), true); }
    };
    const onUserOnline = (id: Any) => {
      if (!alive) return;
      const w = liveWalkersRef.current.get(String(id));
      if (w) { w.offline = false; mapHook.setWalkerOffline(String(id), false); }
    };

    // An opposite-role walker published (or cleared) their shared route.
    // Its endpoints go on the walker entry, so the card shows "from → to".
    const onRoutePublished = (active: Any) => {
      if (!alive || !active) return;
      const uid = String(active.userId);
      if (blockStore.has(uid)) return;
      const ends = routeEndsOf(active);
      if (ends) {
        routeEnds.set(uid, ends);
        const w = liveWalkersRef.current.get(uid);
        if (w) Object.assign(w, ends);
      }
      const coords = (active.points || []).map((p: Any) => [p.lat, p.lng] as LatLng);
      if (coords.length < 2) return;
      mapHook.setWalkerRoute(uid, coords, colorForId(uid));
    };
    const onRouteCleared = (uid: Any) => {
      if (!alive) return;
      const id = String(uid);
      routeEnds.delete(id);
      const w = liveWalkersRef.current.get(id);
      if (w) { w.start = null; w.dest = null; w.startLabel = null; w.destLabel = null; w.routePoints = null; }
      mapHook.removeWalkerRoute(id);
    };

    // A new opposite-role walker just joined — place the marker and surface a
    // one-off "joined" notification (spec §17 walker-joined rule).
    const onJoined = (pos: Any) => {
      if (!alive || blockStore.has(pos?.userId)) return;
      onMoved(pos); // add/refresh the marker (schedules a profile refresh if new)
      const profile = profiles.get(pos.userId);
      const name = profile
        ? enrichLiveWalker(profile, pos).name
        : (pos.role === 'driver' ? t('common.driver') : t('common.passenger'));
      const loc = userLocRef.current;
      const km = loc && pos.lat != null ? haversineKm(loc, [pos.lat, pos.lng]) : null;
      if (km != null && km > NEARBY_KM) return; // far away: on the map, but no toast
      const body = km != null ? `${name} • ${t('common.km', { n: km.toFixed(1) })}` : name;
      const toast = () => { if (alive && !walkerAlertService.firedFor(pos.userId)) notify({ title: t('push.walkerJoinedTitle'), body }); };
      if (walkerAlertService.isOn()) setTimeout(toast, JOINED_TOAST_DEFER_MS); // one toast per arrival, not two
      else toast();
    };

    // Someone (re)connected. Only a walker already on the map without a known profile
    // needs one fetched; anyone else shows up through WalkerJoined (which fetches it).
    const onUserOnlineRefresh = (id: Any) => {
      const uid = String(id);
      if (alive && !profiles.has(uid) && presenceClient.getPositions().some((p) => p.userId === uid)) scheduleRefresh();
    };

    const unsubs = [
      presenceClient.on('WalkerJoined', onJoined),
      presenceClient.on('WalkerMoved', onMoved),
      presenceClient.on('WalkerGone', onGone),
      presenceClient.on('RoutePublished', onRoutePublished),
      presenceClient.on('RouteCleared', onRouteCleared),
      presenceClient.on('UserOnline', onUserOnlineRefresh),
      presenceClient.on('UserOnline', onUserOnline),
      presenceClient.on('UserOffline', onUserOffline),
      presenceClient.on('Walkers', render),
    ];
    // Blocked / unblocked here: hide (or redraw) at once, without waiting for the server.
    window.addEventListener(BLOCK_EVENT, render);
    unsubs.push(() => window.removeEventListener(BLOCK_EVENT, render));

    // Announce our search role so the hub streams only the opposite role.
    presenceClient.setMode(mode).catch(() => {});

    (async () => {
      mapHook.clearWalkers();
      liveWalkersRef.current = new Map();
      const userLoc = userLocRef.current || await getCurrentLatLng();
      if (!alive) return;
      if (userLoc) {
        userLocRef.current = userLoc;
        mapHook.setUserLocation(userLoc);
        mapHook.flyTo(userLoc, 15); // focus the map on the current location on entry
        onLocated(userLoc);
      } else {
        // Never pretend: without a fix there is no "you" marker — show the city
        // and let the map chrome ask for location access.
        onLocationUnknown();
        mapHook.flyTo(TASHKENT, 12);
      }
      await refresh();
      if (!alive || !userLoc) return;
      const nearby = [...liveWalkersRef.current.values()]
        .map((w) => w.position)
        .filter((p) => p && haversineKm(userLoc, p) <= NEARBY_KM);
      if (nearby.length) mapHook.fitPoints([userLoc, ...nearby]);
      // Auto-resume: redraw the retained session's live route once per boot.
      const restoreTrip = pendingRestoreRef.current;
      if (restoreTrip) {
        pendingRestoreRef.current = null;
        await restoreLiveRoute(restoreTrip);
      }
    })();

    return () => {
      alive = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubs.forEach((u) => u());
    };
  }, [screen, mode]); // eslint-disable-line react-hooks/exhaustive-deps
}
