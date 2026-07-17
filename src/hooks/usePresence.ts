/* ════════════════════════════════════════════════════════════════
   usePresence — render real online walkers from the presence hub.
   ────────────────────────────────────────────────────────────────
   The live-map counterpart to the mock simulation: subscribes to the
   presence hub, keeps the per-walker marker/route layers in sync
   (join / move / gone / route-published / offline-grace), refreshes
   profiles, and focuses the map on entry.

   Shared app pieces are injected (map controller, the live-walker ref,
   openWalker popup opener, matchCount/showMatching setters, notify, and
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
import { enrichLiveWalker, colorForId } from '@/services/liveWalkers';
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
  setMatchCount: (n: number) => void;
  setShowMatching: (v: boolean) => void;
  restoreLiveRoute: (trip: Any) => void;
  pendingRestoreRef: MutableRefObject<Any>;
  getCurrentLatLng: () => Promise<LatLng | null>;
}

export function usePresence({
  screen, mode, mapHook, liveWalkersRef, userLocRef, openWalker, notify,
  setMatchCount, setShowMatching, restoreLiveRoute, pendingRestoreRef, getCurrentLatLng,
}: UsePresenceArgs) {
  useEffect(() => {
    if (USE_MOCKS || screen !== 'map' || !mode) return undefined;
    let alive = true;
    const profiles = new Map<string, Any>(); // userId → WalkerProfileDto
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const oppositeRole = mode === 'driver' ? 'passenger' : 'driver';

    const render = () => {
      if (!alive) return;
      const positions = presenceClient.getPositions();
      const seen = new Set();
      positions.forEach((pos) => {
        if (pos.role && pos.role !== oppositeRole) return; // stale other-role entry
        const profile = profiles.get(pos.userId);
        if (!profile) return; // profile not loaded yet; a refresh will pick it up
        const w = enrichLiveWalker(profile, pos);
        const prev = liveWalkersRef.current.get(w.id);
        if (prev && prev.offline) w.offline = true; // keep the greyed state
        liveWalkersRef.current.set(w.id, w);
        seen.add(w.id);
        mapHook.upsertWalkerMarker(w, openWalker);
      });
      // Drop walkers that are gone / no longer positioned.
      [...liveWalkersRef.current.keys()].forEach((id) => {
        if (!seen.has(id)) { liveWalkersRef.current.delete(id); mapHook.removeWalkerMarker(id); }
      });
      setMatchCount(liveWalkersRef.current.size);
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
      if (!alive) return;
      if (!profiles.has(pos.userId)) { scheduleRefresh(); return; }
      const w = enrichLiveWalker(profiles.get(pos.userId), pos);
      liveWalkersRef.current.set(w.id, w);
      mapHook.upsertWalkerMarker(w, openWalker);
    };
    const onGone = (id: Any) => {
      if (!alive) return;
      liveWalkersRef.current.delete(id);
      mapHook.removeWalkerRoute(id);
      mapHook.removeWalkerMarker(id);
      setMatchCount(liveWalkersRef.current.size);
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
    const onRoutePublished = (active: Any) => {
      if (!alive || !active) return;
      const uid = String(active.userId);
      const coords = (active.points || []).map((p: Any) => [p.lat, p.lng] as LatLng);
      if (coords.length < 2) return;
      mapHook.setWalkerRoute(uid, coords, colorForId(uid));
    };
    const onRouteCleared = (uid: Any) => { if (alive) mapHook.removeWalkerRoute(String(uid)); };

    // A new opposite-role walker just joined — place the marker and surface a
    // one-off "joined" notification (spec §17 walker-joined rule).
    const onJoined = (pos: Any) => {
      if (!alive) return;
      onMoved(pos); // add/refresh the marker (schedules a profile refresh if new)
      const profile = profiles.get(pos.userId);
      const name = profile
        ? enrichLiveWalker(profile, pos).name
        : (pos.role === 'driver' ? t('common.driver') : t('common.passenger'));
      const loc = userLocRef.current;
      const body = loc && pos.lat != null
        ? `${name} • ${haversineKm(loc, [pos.lat, pos.lng]).toFixed(1)} km`
        : name;
      notify({ title: t('push.walkerJoinedTitle'), body });
    };

    const unsubs = [
      presenceClient.on('WalkerJoined', onJoined),
      presenceClient.on('WalkerMoved', onMoved),
      presenceClient.on('WalkerGone', onGone),
      presenceClient.on('RoutePublished', onRoutePublished),
      presenceClient.on('RouteCleared', onRouteCleared),
      presenceClient.on('UserOnline', scheduleRefresh),
      presenceClient.on('UserOnline', onUserOnline),
      presenceClient.on('UserOffline', onUserOffline),
      presenceClient.on('Walkers', render),
    ];

    // Announce our search role so the hub streams only the opposite role.
    presenceClient.setMode(mode).catch(() => {});

    (async () => {
      mapHook.clearWalkers();
      liveWalkersRef.current = new Map();
      const userLoc = userLocRef.current || await getCurrentLatLng() || TASHKENT;
      if (!alive) return;
      userLocRef.current = userLoc;
      mapHook.setUserLocation(userLoc);
      mapHook.flyTo(userLoc, 15); // focus the map on the current location on entry
      await refresh();
      if (!alive) return;
      setShowMatching(true);
      const pts = [userLoc, ...[...liveWalkersRef.current.values()].map((w) => w.position).filter(Boolean)];
      if (pts.length > 1) mapHook.fitPoints(pts);
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
