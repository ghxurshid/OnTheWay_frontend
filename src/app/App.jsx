/* ════════════════════════════════════════════════════════════════
   App — top-level screen orchestrator + map/simulation controller.
   Holds screen routing (loading → home → map), owns the map hook, and
   drives the walker simulation, routing, calls, chat and push toasts.
   All data flows through services/hooks; no mock import lives here.
   ════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useCallback } from 'react';
import { T, themeStore } from '@/constants/theme';
import { t } from '@/i18n';
import { TASHKENT } from '@/constants/map';
import { CHAT_REPLY_KEYS } from '@/constants/app';
import { haversineKm } from '@/utils/geo';
import { useMap } from '@/hooks/useMap';
import WalkerSim from '@/services/simulationService';
import { simStore } from '@/services/simStore';
import { unreadStore } from '@/services/unreadStore';
import { savedStore } from '@/services/savedStore';
import { RouteServer } from '@/services/routeService';
import { listContacts } from '@/services/contactService';
import { ensureAuth } from '@/services/authService';
import { connectRealtime, startLocationReporting, stopLocationReporting, callClient, presenceClient } from '@/services/realtime';
import { walkerStateStore } from '@/services/walkerStateStore';
import { bookingStore } from '@/services/bookingStore';
import { initTelegramUi } from '@/services/telegram';
import { walkerApi } from '@/api/walkerApi';
import { tripApi } from '@/api/tripApi';
import { getRoute } from '@/services/routeService';
import { enrichLiveWalker, colorForId, initialsOf } from '@/services/liveWalkers';
import { USE_MOCKS } from '@/api/client';

import { LoadingScreen } from '@/pages/LoadingScreen';
import { HomeScreen } from '@/pages/HomeScreen';
import { MapUI } from '@/features/matching/MapUI';
import { UserPopup } from '@/features/matching/UserPopup';
import { WalkerPreviewCard } from '@/features/matching/WalkerPreviewCard';
import { BookingRequestPrompt } from '@/features/matching/BookingRequestPrompt';
import { BookingAgreementsSheet } from '@/features/matching/BookingAgreementsSheet';
import { bookingApi } from '@/api/bookingApi';
import { authStore } from '@/services/authStore';
import { SideDrawer } from '@/features/navigation/SideDrawer';
import { PushToast } from '@/features/navigation/PushToast';
import { RouteSheet } from '@/features/route/RouteSheet';
import { MapPickOverlay } from '@/features/route/MapPickOverlay';
import { CallScreen } from '@/features/call/CallScreen';
import { ChatScreen } from '@/features/chat/ChatScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { ComplaintScreen } from '@/features/complaint/ComplaintScreen';
import { PrivacyScreen } from '@/features/privacy/PrivacyScreen';

const Sim = WalkerSim;

// Compass / heading-up navigation helpers ─────────────────────────────────
// Balanced follow-zoom: the faster you move the further ahead you see. Discrete
// steps (with the navFollow 0.5 threshold) avoid constant re-zoom jitter.
function zoomForSpeed(kmh) {
  if (kmh == null || Number.isNaN(kmh)) return 17;
  if (kmh < 5) return 17;   // stationary / walking
  if (kmh < 20) return 16;  // slow
  if (kmh < 45) return 15;  // city driving
  return 14;                // fast
}

// Turn a DeviceOrientation event into a compass heading (degrees clockwise from
// north), used to keep "heading up" while stationary (GPS course drives it while
// moving). Mirrors leaflet-rotate's own device-orientation math.
function compassHeadingFromEvent(e) {
  if (!e) return null;
  let angle = null;
  if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
    angle = e.webkitCompassHeading;          // iOS: already clockwise from north
  } else if (typeof e.alpha === 'number' && !Number.isNaN(e.alpha)) {
    angle = 360 - e.alpha;                   // spec alpha is counter-clockwise
  }
  if (angle == null) return null;
  const so = (typeof window !== 'undefined' && window.screen && window.screen.orientation
    && window.screen.orientation.angle) || 0;
  return ((angle + so) % 360 + 360) % 360;   // compensate screen rotation, normalise
}

// Shortest signed difference to→from in degrees, range (-180, 180]. Lets us
// smooth/compare headings across the 360°/0° seam without a discontinuity.
function angleDelta(to, from) {
  return ((to - from + 540) % 360) - 180;
}

// Real backend user ids are numeric (long, serialized as digits); simulated
// walkers use 'sim_'/'simr_' ids. A numeric id ⇒ a real, callable/chattable user.
const REAL_ID_RE = /^\d+$/;
const isRealUser = (id) => !USE_MOCKS && REAL_ID_RE.test(String(id ?? ''));

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
  const [callState, setCallState] = useState(null);
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
  const [incomingBooking, setIncomingBooking] = useState(null); // driver's pending request prompt
  const [bookingBusy, setBookingBusy] = useState(false);
  const [agreements, setAgreements] = useState([]); // accepted bookings (active agreements)
  const [showAgreements, setShowAgreements] = useState(false);
  const [busyBookingId, setBusyBookingId] = useState(null);
  const [followMe, setFollowMe] = useState(false); // compass: keep the map on the live location
  const [freeMode, setFreeMode] = useState(false); // share live location without a trip (asks permission on enable)
  const [hasCreatedTrip, setHasCreatedTrip] = useState(false); // created a trip this session (route or schedule)
  // "Engaged" viewers (created a trip, or a driver in Free Mode) only browse the
  // live map; the separate Planned Trips board is hidden for them (spec §17).
  const engaged = hasCreatedTrip || (mode === 'driver' && freeMode);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [overlayPanel, setOverlayPanel] = useState(null); // 'settings' | 'complaint' | 'privacy'
  const [authReady, setAuthReady] = useState(USE_MOCKS); // mock mode needs no auth
  const [sessionReady, setSessionReady] = useState(USE_MOCKS); // server snapshot fetched (or failed)
  const [authError, setAuthError] = useState(null);
  const [loaderDone, setLoaderDone] = useState(false);
  const [bootNonce, setBootNonce] = useState(0);
  const bootRef = useRef(false);
  const restoredSessionRef = useRef(null); // server session snapshot fetched on boot
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
  const followMeRef = useRef(false);       // compass/heading-up mode active
  const sensorHeadingRef = useRef(null);   // latest (smoothed) device-compass heading
  const smoothHeadingRef = useRef(null);   // circular-EMA state for compass smoothing
  const appliedBearingRef = useRef(null);  // last bearing actually pushed to the map
  const movingRef = useRef(false);         // GPS heading is currently trustworthy
  const contactsRef = useRef([]);
  const liveWalkersRef = useRef(new Map()); // userId → enriched live walker

  const mapHook = useMap(mapContainerRef, screen === 'map');

  // One-time auth + realtime bootstrap (skipped entirely in mock mode).
  useEffect(() => {
    initTelegramUi();
    if (USE_MOCKS || bootRef.current) return;
    bootRef.current = true;
    (async () => {
      try {
        await ensureAuth();
        setAuthReady(true);
        await connectRealtime();
        // Restore the retained session from the server (role, free mode, active
        // trip, bookings) so a reopened app resumes its pre-close state.
        restoredSessionRef.current = await walkerStateStore.restoreFromServer();
        if (restoredSessionRef.current) bookingStore.seed(restoredSessionRef.current.bookings);
        setSessionReady(true); // splash may proceed (and possibly auto-resume)
        // Location is NOT shared on entry — no permission prompt until the user
        // creates a trip or turns on Free Mode (see the freeMode effect below).
      } catch (e) {
        setAuthError(e?.message || String(e));
      }
    })();
  }, [bootNonce]);

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
  }, [screen, loaderDone, authReady, sessionReady, authError]);

  // Contacts loaded once authenticated (used by the push-message simulation).
  useEffect(() => {
    if (!authReady) return;
    listContacts().then((c) => { contactsRef.current = c; }).catch(() => {});
  }, [authReady]);

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

  // Apply one "heading-up" follow frame: recenter on the live position, rotate
  // the map so the current heading (GPS course while moving, device compass while
  // stationary) points up, keep zoom balanced for the speed, and lock the "me"
  // arrow pointing forward (up). No-op unless compass/follow mode is on.
  const applyFollow = useCallback((pos, heading, kmh) => {
    if (!followMeRef.current || !pos) return;
    mapHook.setUserLocation(pos, 0); // arrow forward = screen up (map carries heading)
    // Only a confirmed moving GPS course drives the bearing here; while parked the
    // (smoothed) device compass owns the rotation via the orientation effect.
    if (heading != null) { mapHook.rotateTo(heading); appliedBearingRef.current = heading; }
    mapHook.navFollow(pos, zoomForSpeed(kmh));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mapHook methods are stable

  // Compass button. On enable, request the iOS device-orientation permission
  // (must happen from the user gesture) so heading-up rotation works there too.
  const toggleFollow = useCallback(() => {
    setFollowMe((f) => {
      const next = !f;
      if (next && typeof DeviceOrientationEvent !== 'undefined'
        && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().catch(() => {});
      }
      return next;
    });
  }, []);

  // Always-on location tracking: once permission is granted, continuously watch
  // the real location and keep the "me" marker in sync — independent of compass.
  // When compass/follow mode is on, also recenter + rotate (heading up) + zoom.
  // Paused while an active trip runs (trip navigation owns the marker instead).
  useEffect(() => {
    if (screen !== 'map' || activeRoute) return undefined;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return undefined;
    let lastPos = null;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const pos = [p.coords.latitude, p.coords.longitude];
        const spd = p.coords.speed;
        const kmh = spd != null && !Number.isNaN(spd) && spd >= 0 ? spd * 3.6 : null;
        // Only treat the fix as "moving" when speed confirms it — otherwise a
        // parked GPS wandering ±5-10m would feed random headings and spin the map.
        // Movement gates rotation source: GPS course while moving, compass while not.
        let heading = null;
        const gh = p.coords.heading;
        const movingBySpeed = kmh != null && kmh >= 3;
        if (movingBySpeed && gh != null && !Number.isNaN(gh)) { heading = gh; movingRef.current = true; }
        else if (movingBySpeed && lastPos && haversineKm(lastPos, pos) > 0.006) { heading = Sim.bearing(lastPos, pos); movingRef.current = true; }
        else if (kmh == null && lastPos && haversineKm(lastPos, pos) > 0.012) { heading = Sim.bearing(lastPos, pos); movingRef.current = true; }
        else movingRef.current = false;
        lastPos = pos;
        userLocRef.current = pos;
        if (followMeRef.current) applyFollow(pos, heading, kmh);
        else mapHook.setUserLocation(pos, heading);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
    // Grabbing the map by hand releases follow so panning stays free.
    const offDrag = mapHook.onUserDrag(() => { if (followMeRef.current) setFollowMe(false); });
    return () => { navigator.geolocation.clearWatch(id); offDrag(); };
  }, [screen, activeRoute]); // eslint-disable-line react-hooks/exhaustive-deps

  // Device compass: feeds the heading-up rotation while stationary (when GPS
  // course is unreliable). Active whenever the map is open; only applied while
  // follow mode is on and we're not moving.
  useEffect(() => {
    if (screen !== 'map') return undefined;
    if (typeof window === 'undefined' || !window.DeviceOrientationEvent) return undefined;
    const onOrient = (e) => {
      const raw = compassHeadingFromEvent(e);
      if (raw == null) return;
      // Circular exponential smoothing: track the shortest-path delta so noisy
      // ±few-degree sensor jitter is averaged out instead of shaking the map.
      // A large delta (real turn / flip) snaps through so we stay responsive.
      const prev = smoothHeadingRef.current;
      let sm;
      if (prev == null) sm = raw;
      else {
        const d = angleDelta(raw, prev);
        sm = Math.abs(d) > 60 ? raw : prev + 0.15 * d;
      }
      sm = (sm % 360 + 360) % 360;
      smoothHeadingRef.current = sm;
      sensorHeadingRef.current = sm;
      if (!followMeRef.current || movingRef.current) return;
      // Deadband: only retarget the rotation once the smoothed heading has drifted
      // enough to matter; rotateTo then eases there, so tiny churn never shakes.
      const applied = appliedBearingRef.current;
      if (applied == null || Math.abs(angleDelta(sm, applied)) >= 3) {
        appliedBearingRef.current = sm;
        mapHook.rotateTo(sm);
      }
    };
    window.addEventListener('deviceorientationabsolute', onOrient, true);
    window.addEventListener('deviceorientation', onOrient, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', onOrient, true);
      window.removeEventListener('deviceorientation', onOrient, true);
    };
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mirror followMe into a ref (read inside watch callbacks) and react to toggles:
  // on → snap to the live location immediately; off → straighten the map (north up)
  // and restore the free-pointing "me" arrow.
  useEffect(() => {
    followMeRef.current = followMe;
    if (followMe) {
      if (userLocRef.current) applyFollow(userLocRef.current, null, null);
    } else {
      appliedBearingRef.current = null;
      smoothHeadingRef.current = null;
      mapHook.setBearing(0); // straighten north-up instantly
      if (userLocRef.current) mapHook.setUserLocation(userLocRef.current, null);
    }
  }, [followMe]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Compass follow works during an active trip too: rotate heading-up and
      // recenter; otherwise just point the marker along the heading.
      if (followMeRef.current) applyFollow(pos, hd, speedKmh);
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

  const handleCall = async (user) => {
    setSelectedUser(null);
    if (isRealUser(user.id)) {
      try {
        await callClient.startCall(user.id, 'audio');
        setCallState({ user, phase: 'ringing', live: true, role: 'caller' });
      } catch (e) {
        setPushNotif({ title: t('call.failedTitle'), body: e?.message || '' });
      }
      return;
    }
    setCallState({ user, phase: 'ringing' });
  };

  // End/decline helpers that also drive the CallHub for real calls.
  const endCall = () => {
    if (callState?.live) callClient.hangup().catch(() => {});
    setCallState(null);
  };
  const declineCall = () => {
    if (callState?.live) {
      const reject = callState.role === 'callee' && callState.phase === 'ringing';
      (reject ? callClient.rejectCall() : callClient.hangup()).catch(() => {});
    }
    setCallState(null);
  };

  const walkerToCallUser = (w) => ({
    id: w.id, type: w.type, initials: w.initials, name: w.name,
    sub: w.type === 'driver' ? `${w.vehicle} · ${w.seats} ${t('common.seats')}` : t('common.passenger'),
    rating: w.rating, latlng: w.fromLatlng,
  });

  // --- Ride agreements (bookings) ---
  // Passenger requests a seat on a driver's trip (walker.id is the trip id).
  const handleRequestRide = async (w) => {
    cancelTask();
    try {
      await bookingApi.create(w.id, 1);
      setPushNotif({ title: t('booking.requestSentTitle'), body: t('booking.requestSentBody') });
    } catch (e) {
      setPushNotif({ title: t('booking.requestFailedTitle'), body: e?.message || '' });
    }
  };
  // Driver acts on an incoming request.
  const respondBooking = async (b, action) => {
    setBookingBusy(true);
    try {
      const updated = await bookingApi[action](b.id);
      if (updated) bookingStore.apply({ type: action === 'accept' ? 'accepted' : 'rejected', booking: updated });
    } catch (e) {
      setPushNotif({ title: t('booking.actionFailedTitle'), body: e?.message || '' });
    } finally {
      setBookingBusy(false);
      setIncomingBooking(null);
    }
  };
  // Cancel (either party) or complete (driver) an active agreement.
  const actOnAgreement = async (b, action) => {
    setBusyBookingId(b.id);
    try {
      await bookingApi[action](b.id);
      const status = action === 'cancel' ? 'Cancelled' : 'Completed';
      bookingStore.apply({ type: action === 'cancel' ? 'cancelled' : 'completed', booking: { ...b, status } });
    } catch (e) {
      setPushNotif({ title: t('booking.actionFailedTitle'), body: e?.message || '' });
    } finally {
      setBusyBookingId(null);
    }
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

  const contactToUser = (c) => ({
    id: c.id, type: c.type, initials: c.initials, name: c.name,
    sub: c.type === 'driver' ? (c.vehicle || t('common.driver')) : t('common.passenger'),
    rating: c.rating, latlng: c.latlng,
  });

  // Resolve the incoming caller's display card: the real profile carried in the
  // invite wins; a live walker already on the map or a contact is the fallback.
  const inviteToCallUser = (invite) => {
    const id = String(invite.fromUserId);
    const p = invite.caller;
    if (p && p.name) {
      const type = p.kind === 'driver' ? 'driver' : 'passenger';
      return {
        id, type, initials: initialsOf(p.name), name: p.name,
        sub: p.username ? `@${p.username}`
          : (type === 'driver' ? (p.vehicle || t('common.driver')) : t('common.passenger')),
        rating: p.rating, photoUrl: p.photoUrl || null,
      };
    }
    const w = liveWalkersRef.current.get(id);
    if (w) {
      return {
        id, type: w.type, initials: w.initials, name: w.name,
        sub: w.type === 'driver' ? (w.vehicle || t('common.driver')) : t('common.passenger'),
        rating: w.rating, photoUrl: w.photoUrl || null,
      };
    }
    const c = contactsRef.current.find((x) => String(x.id) === id);
    return c ? contactToUser(c)
      : { id, type: 'passenger', initials: '👤', name: t('call.unknownCaller') };
  };

  // Incoming calls + lifecycle transitions from the CallHub. Every transition
  // is driven by hub events so both sides' screens stay in step.
  useEffect(() => {
    if (USE_MOCKS || !authReady) return undefined;
    const offIncoming = callClient.on('incoming', (invite) => {
      if (callStateRef.current) return; // already on a call (client auto-rejects)
      setCallState({ user: inviteToCallUser(invite), phase: 'ringing', live: true, role: 'callee' });
    });
    const offAccepted = callClient.on('accepted', () =>
      setCallState((cs) => (cs ? { ...cs, phase: 'active' } : cs)));
    const offEnded = callClient.on('ended', (evt) => {
      const cs = callStateRef.current;
      if (cs?.live) {
        if (evt?.reason === 'timeout') {
          setPushNotif(cs.role === 'caller'
            ? { title: t('call.noAnswerTitle'), body: cs.user?.name || '' }
            : { title: t('call.missedTitle'), body: cs.user?.name || '' });
        } else if (evt?.reason === 'mic-denied') {
          setPushNotif({ title: t('call.micDeniedTitle'), body: '' });
        }
      }
      setCallState(null);
    });
    const offRejected = callClient.on('rejected', () => {
      const cs = callStateRef.current;
      if (cs?.live && cs.role === 'caller') {
        setPushNotif({ title: t('call.declinedTitle'), body: cs.user?.name || '' });
      }
      setCallState(null);
    });
    return () => { offIncoming(); offAccepted(); offEnded(); offRejected(); };
  }, [authReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime ride-agreement (booking) events: update the booking store and toast
  // the affected party (requested→driver, accepted/rejected/…→passenger/other).
  useEffect(() => {
    if (USE_MOCKS || !authReady) return undefined;
    return presenceClient.on('BookingEvent', (evt) => {
      if (!evt || !evt.type) return;
      bookingStore.apply(evt);
      // A new request (I'm the driver) opens an actionable accept/reject prompt;
      // every other transition is just a toast.
      if (evt.type === 'requested') setIncomingBooking(evt.booking);
      else setPushNotif({ title: t(`booking.${evt.type}Title`), body: t(`booking.${evt.type}Body`) });
    });
  }, [authReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the active-agreements list in step with the booking store.
  useEffect(() => {
    const sync = () => setAgreements(bookingStore.accepted());
    sync();
    return bookingStore.subscribe(sync);
  }, []);

  useEffect(() => { if (chatUser) unreadStore.clear(chatUser.id); }, [chatUser]);

  const chatUserRef = useRef(null);
  const callStateRef = useRef(null);
  useEffect(() => { chatUserRef.current = chatUser; }, [chatUser]);
  useEffect(() => { callStateRef.current = callState; }, [callState]);

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
  }, [screen, mode, formatForPopup]);

  const finishPick = (point) => {
    setNavTask((task) => { if (task && task.onDone) task.onDone(point); return null; });
    mapHook.setWalkersDimmed(false);
  };
  const cancelTask = () => {
    mapHook.clearPreviewRoute();
    mapHook.setWalkersDimmed(false);
    setNavTask(null);
  };

  const handleAgreeRide = () => {
    const u = callState && callState.user;
    if (!u) return;
    const pid = 'partner-' + u.id;
    if (!savedStore.has(pid)) {
      savedStore.toggle({ id: pid, type: 'partner', initials: u.initials, label: u.name, sub: u.sub });
    }
    setPushNotif({
      title: t('push.rideAgreedTitle'),
      body: t('push.rideAgreedBody', { name: u.name.split(' ')[0] }),
    });
  };

  const handleAcceptCall = () => {
    if (callState?.live) {
      // Flip to active only once the server confirmed the accept, so this
      // screen and the caller's change together. A refused accept (caller
      // already gone) or a later mic denial closes the UI via 'ended'.
      callClient.acceptCall()
        .then(() => setCallState((c) => (c && c.live ? { ...c, phase: 'active' } : c)))
        .catch(() => setCallState(null));
      return;
    }
    // Demo mode: instant accept + a simulated approach on the map.
    setCallState((c) => ({ ...c, phase: 'active' }));
    const userLoc = userLocRef.current || TASHKENT;
    const from = (callState && callState.user && callState.user.latlng) || [41.310, 69.255];
    mapHook.startTracking(from, userLoc, () => { /* ETA */ });
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
          <button onClick={() => { setAuthError(null); bootRef.current = false; setLoaderDone(false); setBootNonce((n) => n + 1); }}
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
            onToggleFollow={toggleFollow}
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
              onRequest={handleRequestRide}
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
    </div>
  );
}
