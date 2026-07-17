/* ════════════════════════════════════════════════════════════════
   App — top-level screen orchestrator + map/simulation controller.
   Holds screen routing (loading → home → map), owns the map hook, and
   drives the walker simulation, routing, calls, chat and push toasts.
   All data flows through services/hooks; no mock import lives here.
   ════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { T, themeStore } from '@/constants/theme';
import { t } from '@/i18n';
import { TASHKENT } from '@/constants/map';
import { CHAT_REPLY_KEYS } from '@/constants/app';
import { haversineKm } from '@/utils/geo';
import { walkerToCallUser, contactToUser } from '@/utils/callUser';
import { useMap } from '@/hooks/useMap';
import { useHeadingFollow } from '@/hooks/useHeadingFollow';
import { useBookings } from '@/hooks/useBookings';
import { useBootstrap } from '@/hooks/useBootstrap';
import { useCallSession } from '@/hooks/useCallSession';
import WalkerSim from '@/services/simulationService';
import { simStore } from '@/services/simStore';
import { unreadStore } from '@/services/unreadStore';
import { RouteServer } from '@/services/routeService';
import { startLocationReporting, stopLocationReporting, callClient, presenceClient } from '@/services/realtime';
import { walkerStateStore } from '@/services/walkerStateStore';
import { walkerApi } from '@/api/walkerApi';
import { tripApi } from '@/api/tripApi';
import { getRoute } from '@/services/routeService';
import { enrichLiveWalker, colorForId } from '@/services/liveWalkers';
import { USE_MOCKS } from '@/api/client';

import { LoadingScreen } from '@/pages/LoadingScreen';
import { HomeScreen } from '@/pages/HomeScreen';
import { MapUI } from '@/features/matching/MapUI';
import { UserPopup } from '@/features/matching/UserPopup';
import { WalkerPreviewCard } from '@/features/matching/WalkerPreviewCard';
import { BookingRequestPrompt } from '@/features/matching/BookingRequestPrompt';
import { BookingAgreementsSheet } from '@/features/matching/BookingAgreementsSheet';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { authStore } from '@/services/authStore';
import { SideDrawer } from '@/features/navigation/SideDrawer';
import { PushToast } from '@/features/navigation/PushToast';
import { RouteSheet } from '@/features/route/RouteSheet';
import { MapPickOverlay } from '@/features/route/MapPickOverlay';
// Overlay screens are opened on demand — lazy-load them so they leave the
// initial bundle. Named exports are adapted to the default export lazy() wants.
const CallScreen = lazy(() => import('@/features/call/CallScreen').then((m) => ({ default: m.CallScreen })));
const ChatScreen = lazy(() => import('@/features/chat/ChatScreen').then((m) => ({ default: m.ChatScreen })));
const SettingsScreen = lazy(() => import('@/features/settings/SettingsScreen').then((m) => ({ default: m.SettingsScreen })));
const ComplaintScreen = lazy(() => import('@/features/complaint/ComplaintScreen').then((m) => ({ default: m.ComplaintScreen })));
const PrivacyScreen = lazy(() => import('@/features/privacy/PrivacyScreen').then((m) => ({ default: m.PrivacyScreen })));

const Sim = WalkerSim;


/** Map an OSRM route ([lat,lng] coords + distance/duration) → RoutePublishDto. */
function toRoutePublishDto(coords, route) {
  const pts = coords.map(([lat, lng]) => ({ lat, lng }));
  return {
    origin: pts[0],
    originLabel: null,
    destination: pts[pts.length - 1],
    destinationLabel: null,
    points: pts,
    distanceKm: route?.distance ? route.distance / 1000 : null,
    etaMinutes: route?.duration ? Math.round(route.duration / 60) : null,
  };
}

/** One-shot device location → [lat,lng], or null if denied/unavailable. */
function getCurrentLatLng() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve([p.coords.latitude, p.coords.longitude]),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 },
    );
  });
}

export function App() {
  const [screen, setScreen] = useState('loading');
  const [mode, setMode] = useState(null);
  const [showSheet, setShowSheet] = useState(false);
  const [showMatching, setShowMatching] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [chatUser, setChatUser] = useState(null);
  const [pushNotif, setPushNotif] = useState(null);
  // Basemap mode is the user's choice ('theme' follows the app light/dark theme,
  // 'streets', 'satellite'); mapStyle is the resolved tile id it maps to.
  const [mapStyleMode, setMapStyleMode] = useState('theme');
  const [mapStyle, setMapStyle] = useState(themeStore.mode === 'light' ? 'light' : 'dark');
  const [matchCount, setMatchCount] = useState(0);
  const [, setRoutePicking] = useState(false);
  const [activeRoute, setActiveRoute] = useState(null);
  const [navProgress, setNavProgress] = useState(0);
  const [navTask, setNavTask] = useState(null); // {type:'pick'|'preview', ...}
  const [followMe, setFollowMe] = useState(false); // compass: keep the map on the live location
  const [freeMode, setFreeMode] = useState(false); // share live location without a trip (asks permission on enable)
  const [hasCreatedTrip, setHasCreatedTrip] = useState(false); // created a trip this session (route or schedule)
  // "Engaged" viewers (created a trip, or a driver in Free Mode) only browse the
  // live map; the separate Planned Trips board is hidden for them (spec §17).
  const engaged = hasCreatedTrip || (mode === 'driver' && freeMode);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [overlayPanel, setOverlayPanel] = useState(null); // 'settings' | 'complaint' | 'privacy'
  const [loaderDone, setLoaderDone] = useState(false);
  const pendingRestoreRef = useRef(null);  // active trip to redraw once the map is up
  const liveTripIdRef = useRef(null);      // persisted Live trip backing the on-map route
  const mapContainerRef = useRef(null);

  const userLocRef = useRef(null);
  const simRef = useRef(null);
  const simWalkersRef = useRef([]);
  const mapStyleRef = useRef(themeStore.mode === 'light' ? 'light' : 'dark');
  const mapStyleModeRef = useRef('theme');
  const navTimerRef = useRef(null);        // mock-mode simulated-nav interval
  const navWatchRef = useRef(null);        // navigator.geolocation.watchPosition id
  const lastRealPosRef = useRef(null);     // previous real fix (heading fallback)
  const navSpeedRef = useRef(0);           // smoothed real speed (km/h)
  const navProgRef = useRef(0);
  const activeRouteRef = useRef(null);
  const liveWalkersRef = useRef(new Map()); // userId → enriched live walker

  const mapHook = useMap(mapContainerRef, screen === 'map');

  // One-time auth + realtime + session-restore boot (owns readiness/error state).
  const { authReady, sessionReady, authError, restoredSessionRef, contactsRef, retry: retryBoot } = useBootstrap();

  // Leave the splash once the loader bar, auth AND the session snapshot are
  // ready. A retained session with an active (Scheduled/InProgress) trip resumes
  // STRAIGHT onto the map in the stored role — no mode-selection screen — and
  // queues the trip so its route is redrawn once the map is up.
  useEffect(() => {
    if (screen !== 'loading' || !loaderDone || !authReady || !sessionReady || authError) return;
    const snap = restoredSessionRef.current;
    const trip = snap && snap.activeTrip;
    const role = snap && snap.state && snap.state.role;
    const status = trip ? String(trip.status || '').toLowerCase() : '';
    if (!USE_MOCKS && trip && role && (status === 'scheduled' || status === 'inprogress')) {
      pendingRestoreRef.current = trip;
      setMode(role);
      setHasCreatedTrip(true);
      setScreen('map');
    } else {
      setScreen('home');
    }
  }, [screen, loaderDone, authReady, sessionReady, authError]); // eslint-disable-line react-hooks/exhaustive-deps -- restoredSessionRef is a stable ref

  useEffect(() => { mapHook.setMapStyle && mapHook.setMapStyle(mapStyle); }, [mapStyle, screen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve a basemap mode to a concrete tile style ('theme' tracks the app theme).
  const resolveMapStyle = useCallback((modeId) =>
    modeId === 'theme' ? (themeStore.mode === 'light' ? 'light' : 'dark') : modeId, []);

  // Picker change: remember the mode and apply the resolved tile style.
  const changeMapStyleMode = useCallback((modeId) => {
    mapStyleModeRef.current = modeId;
    setMapStyleMode(modeId);
    setMapStyle(resolveMapStyle(modeId));
  }, [resolveMapStyle]);

  // While in 'theme' mode, follow the app's light/dark theme changes live.
  useEffect(() => themeStore.subscribe(() => {
    if (mapStyleModeRef.current === 'theme') setMapStyle(themeStore.mode === 'light' ? 'light' : 'dark');
  }), []);

  const formatForPopup = useCallback((w) => {
    const userLoc = userLocRef.current || Sim.TASHKENT || TASHKENT;
    const km = Sim ? Sim.haversine(userLoc, w.position) : 0;
    const etaMin = Math.max(1, Math.round(km / 0.4));
    const driverSub = w.vehicle
      ? (w.seats ? `${w.vehicle} · ${w.seats} ${t('common.seats')}` : w.vehicle)
      : t('common.driver');
    return {
      id: w.id, type: w.type, initials: w.initials, name: w.name, color: w.color,
      sub: w.type === 'driver' ? driverSub : t('userPopup.sub'),
      dist: km.toFixed(1) + ' km', eta: etaMin + ' min',
      rating: (typeof w.rating === 'number' ? w.rating.toFixed(1) : (w.rating ?? '—')),
      trips: w.trips ?? 0, latlng: w.position,
    };
  }, []);

  const openWalker = useCallback((id) => {
    const w = simWalkersRef.current.find((x) => x.id === id) || liveWalkersRef.current.get(id);
    if (w) setSelectedUser(formatForPopup(w));
  }, [formatForPopup]);

  useEffect(() => {
    if (!mapHook.highlightWalker) return;
    if (screen !== 'map') return;
    mapHook.highlightWalker(selectedUser ? selectedUser.id : null);
  }, [selectedUser, screen]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildSim = useCallback(async () => {
    if (!Sim || screen !== 'map' || !mode) return;
    if (simRef.current) { simRef.current.stop(); simRef.current = null; }
    mapHook.clearWalkers();
    const oppo = mode === 'driver' ? 'passenger' : 'driver';
    // Prefer the device's real current location so the map focuses on where the
    // user actually is; only fall back to a random point if it's unavailable.
    const userLoc = userLocRef.current || await getCurrentLatLng() || Sim.randomUserLocation();
    userLocRef.current = userLoc;
    mapHook.setUserLocation(userLoc);
    mapHook.flyTo(userLoc, 15);
    const n = simStore.get();
    const walkers = await Sim.generateWalkers(userLoc, oppo, n);
    walkers.sort((a, b) => Sim.haversine(userLoc, a.start) - Sim.haversine(userLoc, b.start));
    const sim = Sim.createSimulation(walkers, {
      intervalMs: 450,
      onTick: (ws) => { simWalkersRef.current = ws; mapHook.tickWalkers(ws); },
    });
    simRef.current = sim;
    const enriched = sim.enriched();
    simWalkersRef.current = enriched;
    mapHook.renderWalkers(enriched, mapStyleRef.current, openWalker);
    mapHook.fitWalkers(userLoc, enriched);
    sim.start();
    setMatchCount(enriched.length);
    setShowMatching(true);
    const nearest = enriched.slice().sort((a, b) =>
      Sim.haversine(userLoc, a.position) - Sim.haversine(userLoc, b.position))[0];
    if (nearest) {
      const f = formatForPopup(nearest);
      setPushNotif({ title: t('push.matchTitle'), body: `${f.name} • ${f.dist} • ${f.eta}`, user: f });
    }
  }, [screen, mode, mapHook, openWalker, formatForPopup]);

  useEffect(() => {
    if (USE_MOCKS && screen === 'map' && mode) buildSim();
    return () => { if (simRef.current) { simRef.current.stop(); simRef.current = null; } };
  }, [screen, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!USE_MOCKS) return undefined; // sim count only drives the mock simulation
    const h = () => { if (screen === 'map' && mode) buildSim(); };
    window.addEventListener('ontheway:simcount', h);
    return () => window.removeEventListener('ontheway:simcount', h);
  }, [screen, mode, buildSim]);

  // ── LIVE map: render real online walkers from presence (replaces the sim) ──
  useEffect(() => {
    if (USE_MOCKS || screen !== 'map' || !mode) return undefined;
    let alive = true;
    const profiles = new Map(); // userId → WalkerProfileDto
    let refreshTimer = null;

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
        list.forEach((p) => profiles.set(p.id, p));
        render();
      } catch { /* keep whatever we have */ }
    };
    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => { refreshTimer = null; refresh(); }, 800);
    };

    const onMoved = (pos) => {
      if (!alive) return;
      if (!profiles.has(pos.userId)) { scheduleRefresh(); return; }
      const w = enrichLiveWalker(profiles.get(pos.userId), pos);
      liveWalkersRef.current.set(w.id, w);
      mapHook.upsertWalkerMarker(w, openWalker);
    };
    const onGone = (id) => {
      if (!alive) return;
      liveWalkersRef.current.delete(id);
      mapHook.removeWalkerRoute(id);
      mapHook.removeWalkerMarker(id);
      setMatchCount(liveWalkersRef.current.size);
    };

    // Offline grace: a disconnected walker STAYS on the map — marker and route
    // greyed — until they return or the server sweeps them (WalkerGone). Their
    // location simply stops updating, and new searches won't include them.
    const onUserOffline = (id) => {
      if (!alive) return;
      const w = liveWalkersRef.current.get(String(id));
      if (w) { w.offline = true; mapHook.setWalkerOffline(String(id), true); }
    };
    const onUserOnline = (id) => {
      if (!alive) return;
      const w = liveWalkersRef.current.get(String(id));
      if (w) { w.offline = false; mapHook.setWalkerOffline(String(id), false); }
    };

    // An opposite-role walker published (or cleared) their shared route — draw it
    // next to their marker so drivers see a passenger's route and vice-versa.
    const onRoutePublished = (active) => {
      if (!alive || !active) return;
      const uid = String(active.userId);
      const coords = (active.points || []).map((p) => [p.lat, p.lng]);
      if (coords.length < 2) return;
      mapHook.setWalkerRoute(uid, coords, colorForId(uid));
    };
    const onRouteCleared = (uid) => { if (alive) mapHook.removeWalkerRoute(String(uid)); };

    // A new opposite-role walker just joined the live map — place the marker and
    // surface a one-off "joined" notification (spec §17 walker-joined rule).
    const onJoined = (pos) => {
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
      setPushNotif({ title: t('push.walkerJoinedTitle'), body });
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

    // Announce our search role so the hub groups us and streams only the
    // opposite role's positions (spec rules 1–2). Re-runs when mode switches.
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

  useEffect(() => {
    mapStyleRef.current = mapStyle;
    if (simRef.current && screen === 'map') {
      mapHook.renderWalkers(simWalkersRef.current, mapStyle, openWalker);
    }
    mapHook.recolorUserRoute && mapHook.recolorUserRoute(mapStyle);
  }, [mapStyle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live-location tracking + heading-up follow mode (extracted hook). Returns the
  // shared follow frame + last-heading ref so trip navigation can reuse them.
  const { applyFollow, lastHeadingRef, followMeRef } = useHeadingFollow({
    mapHook, screen, activeRoute, followMe, setFollowMe, userLocRef,
  });

  // Ride-agreement (booking) domain: owns its own state + realtime sync.
  const {
    incomingBooking, bookingBusy, agreements, showAgreements, setShowAgreements, busyBookingId,
    requestRide, respondBooking, actOnAgreement,
  } = useBookings({ authReady, notify: setPushNotif });

  // 1:1 voice-call lifecycle (owns callState + CallHub events).
  const {
    callState, callStateRef, clearCall, handleCall, endCall, declineCall, handleAcceptCall, handleAgreeRide,
  } = useCallSession({
    authReady, notify: setPushNotif, mapHook, userLocRef, liveWalkersRef, contactsRef,
    dismissSelected: () => setSelectedUser(null),
  });

  // Dismiss any open overlay screen (call / chat / side panel). Used as the
  // recovery action when an overlay's error boundary trips.
  const closeOverlays = useCallback(() => {
    clearCall();
    setChatUser(null);
    setOverlayPanel(null);
  }, [clearCall]);

  // Free Mode / live-location sharing. When on we stream our position into
  // presence (asking permission the first time) so the opposite role can see us
  // without us having created a trip; when off we stop and drop off their maps.
  useEffect(() => {
    // Free Mode is a client-owned live field — mirror it into the session model
    // (which syncs to the server and is restored on reopen).
    walkerStateStore.patch({ freeMode });
    if (USE_MOCKS) return undefined;
    if (freeMode) startLocationReporting();
    else { stopLocationReporting(); presenceClient.stopSharing().catch(() => {}); }
    return undefined;
  }, [freeMode]);

  const openRouteSheet = () => {
    if (activeRouteRef.current) {
      setPushNotif({ title: t('push.routeActiveTitle'), body: t('push.routeActiveBody') });
      return;
    }
    if (simRef.current) simRef.current.stop();
    mapHook.setWalkersDimmed(true);
    setShowSheet(true);
  };
  const closeRouteSheet = () => {
    setShowSheet(false);
    setRoutePicking(false);
    mapHook.setWalkersDimmed(false);
    if (!activeRouteRef.current) mapHook.clearPlanning();
    if (simRef.current) simRef.current.start();
  };

  // Persist the on-map route as a Live trip so the session survives app
  // restarts (and the abandoned-session sweeper can close it if we vanish).
  // Best-effort: the live map keeps working even if persistence fails.
  const createLiveTrip = async (route, coords, waypoints) => {
    try {
      const pts = (waypoints || []).filter((w) => w && w.latlng);
      const from = pts[0];
      const to = pts[pts.length - 1];
      const [oLat, oLng] = (from && from.latlng) || coords[0];
      const [dLat, dLng] = (to && to.latlng) || coords[coords.length - 1];
      const trip = await tripApi.create({
        origin: { latitude: oLat, longitude: oLng, address: (from && from.value) || '' },
        destination: { latitude: dLat, longitude: dLng, address: (to && to.value) || '' },
        departureTimeUtc: new Date().toISOString(),
        totalSeats: mode === 'driver' ? 4 : 1,
        pricePerSeat: 0,
        distanceKm: route.distance ? route.distance / 1000 : null,
        estimatedMinutes: route.duration ? Math.round(route.duration / 60) : null,
        notes: null,
        category: 'Live',
        role: mode === 'driver' ? 'Driver' : 'Passenger',
      });
      if (trip && trip.id != null) {
        liveTripIdRef.current = String(trip.id);
        walkerStateStore.patch({ activeTripId: String(trip.id) });
      }
    } catch (e) {
      console.warn('[trip] live trip persist failed:', e?.message || e);
    }
  };

  // Auto-resume: redraw the retained session's Live trip on reopen — recompute
  // the road between its persisted origin/destination, draw it, re-share it over
  // presence and resume navigation. Planned trips restore the map/mode only.
  const restoreLiveRoute = async (trip) => {
    try {
      if (String(trip.category || '').toLowerCase() !== 'live') return;
      const from = [trip.origin?.latitude, trip.origin?.longitude];
      const to = [trip.destination?.latitude, trip.destination?.longitude];
      if (from.some((v) => v == null) || to.some((v) => v == null)) return;
      const routes = await getRoute([from, to]);
      const r = routes && routes[0];
      if (!r || !r.geometry) return;
      const coords = r.geometry.coordinates.map((c) => [c[1], c[0]]);
      liveTripIdRef.current = String(trip.id);
      presenceClient.publishRoute(toRoutePublishDto(coords, r)).catch(() => {});
      setFreeMode(true); // resume live-location sharing for the restored trip
      mapHook.setRouteLines([]);
      mapHook.renderUserRoute(coords, mapStyleRef.current);
      mapHook.fitRoute(coords);
      startUserNav(r, coords);
    } catch { /* restore is best-effort; the map still works without it */ }
  };

  const handleRouteSelected = async (route, waypoints) => {
    setShowSheet(false);
    setRoutePicking(false);
    if (!route || !route.geometry) return;
    const coords = route.geometry.coordinates.map((c) => [c[1], c[0]]);

    if (USE_MOCKS) {
      // Demo: regenerate simulated walkers along the chosen route.
      const userLoc = userLocRef.current || Sim.randomUserLocation();
      userLocRef.current = userLoc;
      if (simRef.current) { simRef.current.stop(); simRef.current = null; }
      mapHook.clearWalkers();
      mapHook.setUserLocation(userLoc);
      const oppo = mode === 'driver' ? 'passenger' : 'driver';
      const n = simStore.get();
      const walkers = await Sim.generateWalkersForRoute(coords, oppo, n);
      walkers.sort((a, b) => Sim.haversine(userLoc, a.start) - Sim.haversine(userLoc, b.start));
      const sim = Sim.createSimulation(walkers, {
        intervalMs: 450,
        onTick: (ws) => { simWalkersRef.current = ws; mapHook.tickWalkers(ws); },
      });
      simRef.current = sim;
      const enriched = sim.enriched();
      simWalkersRef.current = enriched;
      mapHook.renderWalkers(enriched, mapStyleRef.current, openWalker);
      mapHook.fitWalkers(userLoc, enriched);
      sim.start();
      setMatchCount(enriched.length);
      setShowMatching(true);
      const nearest = enriched.slice().sort((a, b) =>
        Sim.haversine(userLoc, a.position) - Sim.haversine(userLoc, b.position))[0];
      if (nearest) {
        const f = formatForPopup(nearest);
        setPushNotif({ title: t('push.routeMatchTitle'), body: `${f.name} • ${f.dist} • ${f.eta}`, user: f });
      }
    } else {
      // Live: keep real walkers on the map and share this route over presence
      // so watching contacts see it. Creating a trip also starts live-location
      // sharing (permission is asked here) — the Free Mode switch reflects it.
      // The journey is also persisted as a Live trip (restorable on reopen).
      mapHook.setWalkersDimmed(false);
      presenceClient.publishRoute(toRoutePublishDto(coords, route)).catch(() => {});
      setFreeMode(true);
      setHasCreatedTrip(true); // creating a route engages the viewer (planned board hides)
      createLiveTrip(route, coords, waypoints);
    }

    mapHook.setRouteLines([]);
    mapHook.renderUserRoute(coords, mapStyleRef.current);
    mapHook.fitRoute(coords);
    startUserNav(route, coords);
  };

  // Stop every navigation source (the real GPS watch and the mock-mode tween).
  // Safe to call repeatedly.
  const stopNav = () => {
    if (navTimerRef.current) { clearInterval(navTimerRef.current); navTimerRef.current = null; }
    if (navWatchRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(navWatchRef.current);
    }
    navWatchRef.current = null;
  };

  // Render one navigation frame: advance the progress (monotonic — GPS jitter
  // never rewinds it), redraw traveled/remaining, point the "me" marker along
  // the real heading and refresh the live ETA from real speed.
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

  const handleMapTask = async (task) => {
    if (task.type === 'pick') {
      mapHook.setWalkersDimmed(true);
      setNavTask({ type: 'pick', label: task.label, initial: task.current, onDone: task.onDone });
    } else if (task.type === 'preview') {
      mapHook.setWalkersDimmed(true);
      const dist = haversineKm(userLocRef.current || TASHKENT, task.walker.fromLatlng);
      setNavTask({ type: 'preview', walker: task.walker, loading: true, dist });
      const data = await RouteServer.fetch(task.walker);
      mapHook.showPreviewRoute(data.coords);
      setNavTask({ type: 'preview', walker: task.walker, loading: false, data, dist });
    } else if (task.type === 'contactFocus') {
      const c = task.contact;
      if (simRef.current) simRef.current.stop();
      mapHook.hideWalkers(true);
      mapHook.clearPreviewRoute();
      let route = null; let pos = c.latlng;
      if (c.hasRoute) {
        const data = await RouteServer.fetch(c);
        route = data.coords;
        if (Sim && route && route.length > 1) {
          const s = Sim.splitRoute(route, 0.42);
          if (s && s.position) pos = s.position;
        }
      }
      const color = c.type === 'driver' ? T.amber : T.purple;
      mapHook.showContactFocus({ ...c, latlng: pos, route, color });
      const pts = [userLocRef.current || TASHKENT, pos];
      if (route) route.forEach((p) => pts.push(p));
      mapHook.fitPoints(pts);
    } else if (task.type === 'contactClear') {
      mapHook.clearPreviewRoute();
      mapHook.hideWalkers(false);
      if (simRef.current) simRef.current.start();
      mapHook.fitWalkers(userLocRef.current, simWalkersRef.current || []);
    }
  };

  useEffect(() => { if (chatUser) unreadStore.clear(chatUser.id); }, [chatUser]);

  const chatUserRef = useRef(null);
  useEffect(() => { chatUserRef.current = chatUser; }, [chatUser]);

  useEffect(() => {
    const sync = () => mapHook.setWalkerBadges && mapHook.setWalkerBadges(unreadStore.map());
    sync();
    window.addEventListener('ontheway:unread', sync);
    return () => window.removeEventListener('ontheway:unread', sync);
  }, [mapHook, screen]);

  useEffect(() => {
    if (!USE_MOCKS || screen !== 'map' || !mode) return; // demo-only fake messages
    let timer;
    const fire = () => {
      if (!chatUserRef.current && !callStateRef.current) {
        const walkers = simWalkersRef.current || [];
        const pool = [
          ...walkers.map((w) => ({ k: 'w', o: w })),
          ...contactsRef.current.map((c) => ({ k: 'c', o: c })),
        ];
        if (pool.length) {
          const pick = pool[Math.floor(Math.random() * pool.length)];
          const target = pick.k === 'w' ? formatForPopup(pick.o) : contactToUser(pick.o);
          unreadStore.add(target.id, 1);
          const body = t(CHAT_REPLY_KEYS[Math.floor(Math.random() * CHAT_REPLY_KEYS.length)]);
          setPushNotif({ title: target.name, body, user: target, chat: true, action: t('common.chat') });
        }
      }
      timer = setTimeout(fire, 8000 + Math.random() * 9000);
    };
    timer = setTimeout(fire, 6000 + Math.random() * 6000);
    return () => clearTimeout(timer);
  }, [screen, mode, formatForPopup]); // eslint-disable-line react-hooks/exhaustive-deps -- contactsRef is a stable ref

  const finishPick = (point) => {
    setNavTask((task) => { if (task && task.onDone) task.onDone(point); return null; });
    mapHook.setWalkersDimmed(false);
  };
  const cancelTask = () => {
    mapHook.clearPreviewRoute();
    mapHook.setWalkersDimmed(false);
    setNavTask(null);
  };

  const exitToHome = () => {
    setScreen('home'); setShowMatching(false); setShowSheet(false); setRoutePicking(false);
    stopNav();
    if (!USE_MOCKS) {
      // Leaving the map abandons the journey deliberately: withdraw the shared
      // route and call off the backing Live trip (its agreements cascade).
      presenceClient.clearRoute().catch(() => {});
      const liveTripId = liveTripIdRef.current;
      if (liveTripId) {
        liveTripIdRef.current = null;
        tripApi.cancel(liveTripId).catch(() => {});
        if (walkerStateStore.get().activeTripId === liveTripId) {
          walkerStateStore.patch({ clearActiveTrip: true });
        }
      }
    }
    setFreeMode(false); // stop sharing our live location when leaving the map
    setHasCreatedTrip(false); // reset engagement when leaving the map
    activeRouteRef.current = null; setActiveRoute(null); setNavProgress(0);
    mapHook.clearUserRoute(); mapHook.clearPlanning();
    if (simRef.current) { simRef.current.stop(); simRef.current = null; }
    mapHook.clearWalkers(); userLocRef.current = null; setMatchCount(0);
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      background: T.bg, fontFamily: 'DM Sans,sans-serif' }}>

      {/* OSM Map — always mounted when screen=map */}
      <div ref={mapContainerRef}
        style={{ position: 'absolute', inset: 0, zIndex: 0,
          display: screen === 'map' ? 'block' : 'none' }} />

      {screen === 'loading' && !authError && <LoadingScreen onDone={() => setLoaderDone(true)} />}
      {screen === 'loading' && authError && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, textAlign: 'center',
          background: T.bg }}>
          <div style={{ fontSize: 34 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{t('auth.failedTitle')}</div>
          <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, maxWidth: 360 }}>{authError}</div>
          <button onClick={() => { retryBoot(); setLoaderDone(false); }}
            style={{ marginTop: 8, padding: '11px 22px', borderRadius: 12, border: 'none',
              background: `linear-gradient(135deg,${T.teal},#0e9e97)`, color: 'white', fontSize: 14,
              fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
            {t('auth.retry')}
          </button>
        </div>
      )}

      {screen === 'home' && (
        <HomeScreen onSelect={(m) => { setMode(m); walkerStateStore.patch({ role: m }); setScreen('map'); }} />
      )}

      {screen === 'map' && !callState && (
        <>
          <MapUI
            mode={mode}
            mapHook={mapHook}
            showMatching={showMatching && !showSheet}
            matchCount={matchCount}
            routeActive={!!activeRoute}
            activeRoute={activeRoute}
            navProgress={navProgress}
            onEndRoute={endRoute}
            onRouteSheet={openRouteSheet}
            userLoc={userLocRef.current}
            onMapTask={handleMapTask}
            navHidden={!!navTask}
            onMenu={() => setDrawerOpen(true)}
            onContactCall={(c) => handleCall(contactToUser(c))}
            onContactSms={(c) => setChatUser(contactToUser(c))}
            mapStyleMode={mapStyleMode}
            appTheme={themeStore.mode}
            onMapStyleChange={changeMapStyleMode}
            follow={followMe}
            onToggleFollow={() => setFollowMe((f) => !f)}
            engaged={engaged}
            onTripCreated={(tripId) => {
              setHasCreatedTrip(true);
              if (tripId) walkerStateStore.patch({ activeTripId: String(tripId) });
            }}
          />
          <SideDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            mode={mode}
            freeMode={freeMode}
            // Free Mode (destination-less live sharing) is driver-only; passengers
            // become visible by creating a trip instead. See business-spec §9.3.
            onToggleFreeMode={() => { if (mode === 'driver') setFreeMode((f) => !f); }}
            onExit={() => { setDrawerOpen(false); exitToHome(); }}
            onOpenPanel={(key) => { setDrawerOpen(false); setOverlayPanel(key); }}
          />
          {showSheet && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none' }}>
              <RouteSheet
                mapHook={mapHook}
                userLoc={userLocRef.current}
                onPickModeChange={setRoutePicking}
                onClose={closeRouteSheet}
                onShowRoute={handleRouteSelected}
              />
            </div>
          )}
          {selectedUser && !showSheet && (
            <UserPopup
              user={selectedUser}
              onClose={() => setSelectedUser(null)}
              onCall={() => handleCall(selectedUser)}
              onChat={() => { setChatUser(selectedUser); setSelectedUser(null); }}
            />
          )}
          <PushToast
            notif={pushNotif}
            onDismiss={() => setPushNotif(null)}
            onView={(n) => {
              setPushNotif(null);
              if (n && n.chat && n.user) { setChatUser(n.user); }
              else if (n && n.user) { setSelectedUser(n.user); }
            }}
          />

          {navTask && navTask.type === 'pick' && (
            <MapPickOverlay
              mapHook={mapHook}
              label={navTask.label}
              initial={navTask.initial}
              onConfirm={finishPick}
              onCancel={cancelTask}
            />
          )}
          {navTask && navTask.type === 'preview' && (
            <WalkerPreviewCard
              task={navTask}
              onBack={cancelTask}
              onCall={(w) => { cancelTask(); handleCall(walkerToCallUser(w)); }}
              onChat={(w) => { cancelTask(); setChatUser(walkerToCallUser(w)); }}
              onRequest={(w) => { cancelTask(); requestRide(w); }}
            />
          )}
          {incomingBooking && (
            <BookingRequestPrompt
              booking={incomingBooking}
              busy={bookingBusy}
              onAccept={(b) => respondBooking(b, 'accept')}
              onReject={(b) => respondBooking(b, 'reject')}
            />
          )}
          {agreements.length > 0 && !navTask && !incomingBooking && (
            <button onClick={() => setShowAgreements(true)} style={{ position: 'absolute', top: 62,
              left: '50%', transform: 'translateX(-50%)', zIndex: 26, pointerEvents: 'auto',
              height: 36, padding: '0 14px', borderRadius: 18, border: `1px solid ${T.teal}55`,
              background: T.glass, backdropFilter: 'blur(12px)', color: T.teal, fontSize: 13,
              fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
              fontFamily: 'DM Sans,sans-serif', boxShadow: `0 4px 14px rgba(0,0,0,.4)` }}>
              🤝 {agreements.length} {t('booking.agreementsPill')}
            </button>
          )}
          {showAgreements && (
            <BookingAgreementsSheet
              bookings={agreements}
              myId={String(authStore.getUser()?.id ?? '')}
              busyId={busyBookingId}
              onCancel={(b) => actOnAgreement(b, 'cancel')}
              onComplete={(b) => actOnAgreement(b, 'complete')}
              onClose={() => setShowAgreements(false)}
            />
          )}
        </>
      )}

      {/* On-demand overlay screens: each isolated by its own error boundary so a
          failure in one (call, chat, a panel) can't take down the map, and lazy
          so they stay out of the initial bundle. */}
      <ErrorBoundary onReset={closeOverlays}>
        <Suspense fallback={null}>
          {callState && (
            <CallScreen
              callee={callState.user}
              phase={callState.phase}
              live={!!callState.live}
              role={callState.role || 'caller'}
              onAccept={handleAcceptCall}
              onAgree={handleAgreeRide}
              onMuteToggle={(m) => callState.live && callClient.setMuted(m)}
              onDecline={declineCall}
              onEnd={endCall}
            />
          )}

          {chatUser && (
            <ChatScreen user={chatUser} onBack={() => setChatUser(null)} />
          )}

          {overlayPanel === 'settings' && <SettingsScreen onClose={() => setOverlayPanel(null)} />}
          {overlayPanel === 'complaint' && <ComplaintScreen onClose={() => setOverlayPanel(null)} />}
          {overlayPanel === 'privacy' && <PrivacyScreen onClose={() => setOverlayPanel(null)} />}
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
