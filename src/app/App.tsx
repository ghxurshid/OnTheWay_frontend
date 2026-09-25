/* ════════════════════════════════════════════════════════════════
   App — top-level screen orchestrator + map/simulation controller.
   Holds screen routing (loading → home → map), owns the map hook, and
   drives the walker simulation, routing, calls, chat and push toasts.
   All data flows through services/hooks; no mock import lives here.
   ════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { T, themeStore, partyColor } from '@/constants/theme';
import { t } from '@/i18n';
import { TASHKENT } from '@/constants/map';
import { randomChatReplyKey } from '@/constants/app';
import { haversineKm, splitRoute } from '@/utils/geo';
import { walkerToCallUser, contactToUser } from '@/utils/callUser';
import type { CallUser } from '@/utils/callUser';
import { initialsOf } from '@/utils/avatar';
import { idOf, isRealUserId } from '@/utils/ids';
import { errorMessage } from '@/utils/errors';
import { useMap } from '@/hooks/useMap';
import type { MapHook } from '@/hooks/mapHook';
import { useMapStyle } from '@/hooks/useMapStyle';
import { useHeadingFollow } from '@/hooks/useHeadingFollow';
import { useBootstrap } from '@/hooks/useBootstrap';
import { useCallSession } from '@/hooks/useCallSession';
import { usePresence } from '@/hooks/usePresence';
import { useTripNavigation } from '@/hooks/useTripNavigation';
import type { NavRoute } from '@/hooks/useTripNavigation';
import { useToastQueue } from '@/hooks/useToastQueue';
import { useRealtimeStatus } from '@/hooks/useRealtimeStatus';
import {
  createSimulation, generateWalkers, generateWalkersForRoute, randomUserLocation,
} from '@/services/simulationService';
import type { SimWalker, Simulation } from '@/services/simulationService';
import { SIM_COUNT_EVENT, simStore } from '@/services/simStore';
import { UNREAD_EVENT, unreadStore } from '@/services/unreadStore';
import { RouteServer, getRoute, routeCoords, toRoutePublishDto } from '@/services/routeService';
import type { OsrmRoute } from '@/services/routeService';
import { reverseGeocode } from '@/services/geocodingService';
import { closeLiveTrip, createLiveTrip, publishBanded } from '@/services/liveTripService';
import type { RouteWaypoint } from '@/services/liveTripService';
import { getCurrentLatLng } from '@/services/geolocation';
import { addContact } from '@/services/contactService';
import { authStore } from '@/services/authStore';
import { confirmAction } from '@/services/confirm';
import { setClosingConfirmation } from '@/services/telegram';
import { startLocationReporting, stopLocationReporting, callClient, chatClient, presenceClient } from '@/services/realtime';
import { walkerStateStore } from '@/services/walkerStateStore';
import { chatApi } from '@/api/chatApi';
import type { ChatMessageDto } from '@/api/chatApi';
import { SESSION_LOST_EVENT, USE_MOCKS } from '@/api/client';
import type { ActiveRoute, LatLng, MapTask, PartyType, Place, RouteData, Walker } from '@/models';

import { LoadingScreen } from '@/pages/LoadingScreen';
import { AuthErrorScreen } from '@/pages/AuthErrorScreen';
import { HomeScreen } from '@/pages/HomeScreen';
import { MapUI } from '@/features/matching/MapUI';
import type { Visibility } from '@/features/matching/MapUI';
import { UserPopup } from '@/features/matching/UserPopup';
import { WalkerPreviewCard } from '@/features/matching/WalkerPreviewCard';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ConfirmHost } from '@/components/ui/ConfirmHost';
import { SideDrawer } from '@/features/navigation/SideDrawer';
import { PushToast } from '@/features/navigation/PushToast';
import { RouteSheet } from '@/features/route/RouteSheet';
import { MapPickOverlay } from '@/features/route/MapPickOverlay';
import type { ChatPeer } from '@/features/contacts/ChatsPanel';
// Overlay screens are opened on demand — lazy-load them so they leave the
// initial bundle. Named exports are adapted to the default export lazy() wants.
const CallScreen = lazy(() => import('@/features/call/CallScreen').then((m) => ({ default: m.CallScreen })));
const ChatScreen = lazy(() => import('@/features/chat/ChatScreen').then((m) => ({ default: m.ChatScreen })));
const SettingsScreen = lazy(() => import('@/features/settings/SettingsScreen').then((m) => ({ default: m.SettingsScreen })));
const ComplaintScreen = lazy(() => import('@/features/complaint/ComplaintScreen').then((m) => ({ default: m.ComplaintScreen })));
const PrivacyScreen = lazy(() => import('@/features/privacy/PrivacyScreen').then((m) => ({ default: m.PrivacyScreen })));
const MyTripsScreen = lazy(() => import('@/features/trips/MyTripsScreen').then((m) => ({ default: m.MyTripsScreen })));

type Screen = 'loading' | 'home' | 'map';

/** The in-map overlay task: a map-pick sheet or a walker route preview. */
type NavTask =
  | { type: 'pick'; label: string; initial: LatLng | null; onDone: (point: Place) => void }
  | { type: 'preview'; walker: Walker; loading: boolean; dist: number; data?: RouteData };

const opposite = (role: PartyType | null): PartyType => (role === 'driver' ? 'passenger' : 'driver');
const byDistanceFrom = (from: LatLng, at: (w: SimWalker) => LatLng | null | undefined) =>
  (a: SimWalker, b: SimWalker) => haversineKm(from, at(a)) - haversineKm(from, at(b));

export function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [mode, setMode] = useState<PartyType | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  // Popup / chat user shapes vary by source (sim walker, contact, call invite),
  // so they stay loosely typed at this orchestration boundary.
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [chatUser, setChatUser] = useState<any>(null);
  // Transient notifications (walker joined, new message, …). The queue shows
  // one at a time and owns every auto-dismiss timer. `push`/`dismiss`/`clear`
  // are referentially stable, so they are safe effect/callback dependencies.
  const { current: toast, exiting: toastExiting, push: notify, dismiss: dismissToast, clear: clearToasts } = useToastQueue();
  const { mapStyle, mapStyleMode, changeMapStyleMode } = useMapStyle();
  const realtime = useRealtimeStatus();
  const [activeRoute, setActiveRoute] = useState<ActiveRoute | null>(null);
  const [navProgress, setNavProgress] = useState(0);
  const [gpsIssue, setGpsIssue] = useState(false);
  const [navTask, setNavTask] = useState<NavTask | null>(null);
  const [followMe, setFollowMe] = useState(false); // compass: keep the map on the live location
  const [freeMode, setFreeMode] = useState(false); // share live location without a trip (asks permission on enable)
  const [hasCreatedTrip, setHasCreatedTrip] = useState(false); // created a trip this session (route or schedule)
  const [banded, setBanded] = useState(() => walkerStateStore.get().engaged); // "band/to'ldi" — marked full, hidden from discovery
  // "Engaged" viewers (created a trip, or a driver in Free Mode) only browse the
  // live map; the separate Planned Trips board is hidden for them (spec §17).
  const engaged = hasCreatedTrip || (mode === 'driver' && freeMode);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [overlayPanel, setOverlayPanel] = useState<string | null>(null); // 'settings' | 'complaint' | 'privacy' | 'myTrips'
  const [loaderDone, setLoaderDone] = useState(false);
  const [sessionLost, setSessionLost] = useState(false);
  const [locationOff, setLocationOff] = useState(false);
  const [areaName, setAreaName] = useState<string | null>(null);
  const [walkerCount, setWalkerCount] = useState<number | null>(null);
  const pendingRestoreRef = useRef<any>(null);            // active trip to redraw once the map is up
  const liveTripIdRef = useRef<string | null>(null);      // persisted Live trip backing the on-map route
  const sharedRouteRef = useRef<{ route: OsrmRoute; coords: LatLng[] } | null>(null); // republished after a reconnect
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const userLocRef = useRef<LatLng | null>(null);
  const simRef = useRef<Simulation | null>(null);
  const simWalkersRef = useRef<SimWalker[]>([]);
  const mapStyleRef = useRef(mapStyle);
  const activeRouteRef = useRef<NavRoute | null>(null);   // shared: current trip route (nav + free-mode + exit)
  const liveWalkersRef = useRef<Map<string, any>>(new Map()); // userId → enriched live walker
  const bandedRef = useRef(banded);
  useEffect(() => { bandedRef.current = banded; }, [banded]);

  const mapHook: MapHook = useMap(mapContainerRef, screen === 'map');

  // One-time auth + realtime + session-restore boot (owns readiness/error state).
  const { authReady, sessionReady, authError, restoredSessionRef, contactsRef, retry: retryBoot } = useBootstrap();

  // Leave the splash once the loader bar, auth AND the session snapshot are
  // ready. A retained session with an active (Scheduled/InProgress) trip resumes
  // STRAIGHT onto the map in the stored role — no mode-selection screen — and
  // queues the trip so its route is redrawn once the map is up.
  useEffect(() => {
    if (screen !== 'loading' || !loaderDone || !authReady || !sessionReady || authError) return;
    const snap = restoredSessionRef.current;
    const trip = snap?.activeTrip;
    const role = snap?.state?.role;
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

  // A session that could not be renewed: stop and ask the user to sign in
  // again, instead of every screen quietly showing empty data.
  useEffect(() => {
    const onLost = () => setSessionLost(true);
    window.addEventListener(SESSION_LOST_EVENT, onLost);
    return () => window.removeEventListener(SESSION_LOST_EVENT, onLost);
  }, []);

  useEffect(() => { mapHook.setMapStyle(mapStyle); }, [mapStyle, screen]); // eslint-disable-line react-hooks/exhaustive-deps -- mapHook is stable

  // Ask before Telegram closes the app while a journey is under way.
  useEffect(() => { setClosingConfirmation(!!activeRoute); }, [activeRoute]);

  const formatForPopup = useCallback((w: any) => {
    const here = userLocRef.current;
    const km = here && w.position ? haversineKm(here, w.position) : null;
    const driverSub = w.vehicle || t('common.driver');
    return {
      id: w.id, type: w.type, initials: w.initials, name: w.name, color: w.color,
      sub: w.type === 'driver' ? driverSub : t('userPopup.sub'),
      dist: km != null ? t('common.km', { n: km.toFixed(1) }) : '—',
      eta: km != null ? t('common.minutes', { n: Math.max(1, Math.round(km / 0.4)) }) : '—',
      rating: (typeof w.rating === 'number' ? w.rating.toFixed(1) : (w.rating ?? '—')),
      trips: w.trips ?? 0, latlng: w.position, match: w.match, offline: !!w.offline,
    };
  }, []);

  const openWalker = useCallback((id: string) => {
    const w = simWalkersRef.current.find((x) => x.id === id) || liveWalkersRef.current.get(id);
    if (w) setSelectedUser(formatForPopup(w));
  }, [formatForPopup]);

  useEffect(() => {
    if (screen === 'map') mapHook.highlightWalker(selectedUser ? selectedUser.id : null);
  }, [selectedUser, screen]); // eslint-disable-line react-hooks/exhaustive-deps -- mapHook is stable

  // The device location is known: label the area in the status bar.
  const located = useCallback((loc: LatLng) => {
    setLocationOff(false);
    reverseGeocode(loc).then((label) => setAreaName(label.split(',').slice(0, 2).join(','))).catch(() => {});
  }, []);

  const retryLocation = async () => {
    const loc = await getCurrentLatLng();
    if (!loc) {
      notify({ title: t('mapui.locationOffTitle'), body: t('mapui.locationOffBody') });
      return;
    }
    userLocRef.current = loc;
    mapHook.setUserLocation(loc);
    mapHook.flyTo(loc, 15);
    located(loc);
  };

  // ── Mock-mode walker simulation ──
  const stopSim = () => { simRef.current?.stop(); simRef.current = null; };

  // Replace the simulated walkers with a fresh set from `generate`, start them
  // moving around `userLoc` and toast the nearest match under `titleKey`.
  const runSimulation = useCallback(async (userLoc: LatLng, generate: () => Promise<SimWalker[]>, titleKey: string) => {
    stopSim();
    mapHook.clearWalkers();
    mapHook.setUserLocation(userLoc);
    const walkers = await generate();
    walkers.sort(byDistanceFrom(userLoc, (w) => w.start));
    const sim = createSimulation(walkers, {
      onTick: (ws) => { simWalkersRef.current = ws; mapHook.tickWalkers(ws); },
    });
    simRef.current = sim;
    const enriched = sim.enriched();
    simWalkersRef.current = enriched;
    setWalkerCount(enriched.length);
    mapHook.renderWalkers(enriched, mapStyleRef.current, openWalker);
    mapHook.fitWalkers(userLoc, enriched);
    sim.start();
    const [nearest] = enriched.slice().sort(byDistanceFrom(userLoc, (w) => w.position));
    if (nearest) {
      const f = formatForPopup(nearest);
      notify({ title: t(titleKey), body: `${f.name} • ${f.dist} • ${f.eta}`, user: f });
    }
  }, [mapHook, openWalker, formatForPopup, notify]);

  const buildSim = useCallback(async () => {
    if (screen !== 'map' || !mode) return;
    // Prefer the device's real current location so the map focuses on where the
    // user actually is; only fall back to a random point if it's unavailable.
    const userLoc = userLocRef.current || await getCurrentLatLng() || randomUserLocation();
    userLocRef.current = userLoc;
    located(userLoc);
    // Place the user first, then fly: the first vector layer must not be added
    // while the fly animation is running (see useMap / mapRenderSync).
    const run = runSimulation(userLoc, () => generateWalkers(userLoc, opposite(mode), simStore.get()), 'push.matchTitle');
    mapHook.flyTo(userLoc, 15);
    await run;
  }, [screen, mode, mapHook, runSimulation, located]);

  useEffect(() => {
    if (USE_MOCKS && screen === 'map' && mode) buildSim();
    return stopSim;
  }, [screen, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!USE_MOCKS) return undefined; // sim count only drives the mock simulation
    const h = () => { if (screen === 'map' && mode) buildSim(); };
    window.addEventListener(SIM_COUNT_EVENT, h);
    return () => window.removeEventListener(SIM_COUNT_EVENT, h);
  }, [screen, mode, buildSim]);

  // ── LIVE map: render real online walkers from presence (replaces the sim) ──
  // restoreLiveRoute is defined further down; reach it through a ref so this
  // hook keeps its original position (and effect order) in the component.
  const restoreLiveRouteRef = useRef<((trip: any) => void) | null>(null);
  usePresence({
    screen, mode, mapHook, liveWalkersRef, userLocRef, openWalker, notify, pendingRestoreRef,
    restoreLiveRoute: (trip) => restoreLiveRouteRef.current?.(trip),
    onLocationUnknown: () => setLocationOff(true),
    onLocated: located,
    onWalkerCount: setWalkerCount,
  });

  useEffect(() => {
    mapStyleRef.current = mapStyle;
    if (simRef.current && screen === 'map') mapHook.renderWalkers(simWalkersRef.current, mapStyle, openWalker);
    mapHook.recolorUserRoute(mapStyle);
  }, [mapStyle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live-location tracking + heading-up follow mode (extracted hook). Returns the
  // shared follow frame + last-heading ref so trip navigation can reuse them.
  const { applyFollow, lastHeadingRef, followMeRef } = useHeadingFollow({
    mapHook, screen, activeRoute, followMe, setFollowMe, userLocRef,
  });

  // Active-route turn-by-turn navigation (owns the nav machinery; activeRoute /
  // navProgress state stays here, read by the map chrome and useHeadingFollow).
  const { startUserNav, stopNav, endRoute } = useTripNavigation({
    mapHook, userLocRef, applyFollow, followMeRef, lastHeadingRef,
    activeRouteRef, liveTripIdRef, setActiveRoute, setNavProgress, onGpsIssue: setGpsIssue,
  });

  // 1:1 voice-call lifecycle (owns callState + CallHub events).
  const {
    callState, callStateRef, clearCall, handleCall, endCall, declineCall, handleAcceptCall, offerRide, respondRide,
  } = useCallSession({
    authReady, notify, mapHook, userLocRef, liveWalkersRef, contactsRef,
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
    if (USE_MOCKS) return;
    if (freeMode) startLocationReporting();
    else { stopLocationReporting(); presenceClient.stopSharing().catch(() => {}); }
  }, [freeMode]);

  // After the realtime link comes back the server may have lost what we told it
  // while offline: re-send the session state, the shared route and "busy".
  useEffect(() => {
    if (USE_MOCKS) return undefined;
    return presenceClient.on('Reconnected', () => {
      walkerStateStore.resync();
      const shared = sharedRouteRef.current;
      if (shared) presenceClient.publishRoute(toRoutePublishDto(shared.coords, shared.route)).catch(() => {});
      if (bandedRef.current) presenceClient.markEngaged().catch(() => {});
    });
  }, []);

  // ── Chat notifications: every incoming message is surfaced, not only the
  // ones for a chat that happens to be open. Unread counts start from the
  // server inbox so they survive reloads and other devices.
  const chatUserRef = useRef<any>(null);
  useEffect(() => { chatUserRef.current = chatUser; }, [chatUser]);

  const chatPeerFor = useCallback((userId: string, fallbackName?: string | null): CallUser => {
    const walker = liveWalkersRef.current.get(userId);
    if (walker) return walkerToCallUser(walker);
    const contact = contactsRef.current.find((c) => idOf(c.id) === userId);
    if (contact) return contactToUser(contact);
    const name = fallbackName || t('common.user');
    return { id: userId, type: 'passenger', name, initials: initialsOf(name), sub: '' };
  }, [contactsRef]);

  useEffect(() => {
    if (USE_MOCKS || !authReady) return undefined;
    chatApi.conversations().then((rows) => {
      unreadStore.replace(Object.fromEntries(rows.filter((r) => r.unreadCount > 0)
        .map((r) => [idOf(r.otherParticipantId), r.unreadCount])));
    }).catch(() => { /* keep the local counts */ });

    const myId = idOf((authStore.getUser() as { id?: string } | null)?.id ?? '');
    return chatClient.on('ReceiveMessage', (m: ChatMessageDto) => {
      const from = idOf(m.senderId);
      if (from === myId) return;
      if (chatUserRef.current && idOf(chatUserRef.current.id) === from) return; // that chat is open
      unreadStore.add(from, 1);
      const user = chatPeerFor(from, m.senderName);
      notify({ title: t('chat.newFrom', { name: user.name.split(' ')[0] }), body: m.content, user, chat: true, action: t('chat.reply') });
    });
  }, [authReady, chatPeerFor, notify]);

  useEffect(() => { if (chatUser) unreadStore.clear(idOf(chatUser.id)); }, [chatUser]);

  useEffect(() => {
    const sync = () => mapHook.setWalkerBadges(unreadStore.map());
    sync();
    window.addEventListener(UNREAD_EVENT, sync);
    return () => window.removeEventListener(UNREAD_EVENT, sync);
  }, [mapHook, screen]);

  // Demo-only: a random walker/contact "writes" every 8–17 s while the user is
  // neither chatting nor on a call.
  useEffect(() => {
    if (!USE_MOCKS || screen !== 'map' || !mode) return undefined;
    let timer: ReturnType<typeof setTimeout>;
    const fire = () => {
      const senders = [
        ...simWalkersRef.current.map((w) => () => formatForPopup(w)),
        ...contactsRef.current.map((c) => () => contactToUser(c)),
      ];
      if (!chatUserRef.current && !callStateRef.current && senders.length) {
        const target = senders[Math.floor(Math.random() * senders.length)]();
        unreadStore.add(target.id, 1);
        notify({ title: target.name, body: t(randomChatReplyKey()), user: target, chat: true, action: t('chat.reply') });
      }
      timer = setTimeout(fire, 8000 + Math.random() * 9000);
    };
    timer = setTimeout(fire, 6000 + Math.random() * 6000);
    return () => clearTimeout(timer);
  }, [screen, mode, formatForPopup]); // eslint-disable-line react-hooks/exhaustive-deps -- contactsRef is a stable ref

  const openRouteSheet = () => {
    if (activeRouteRef.current) {
      notify({ title: t('push.routeActiveTitle'), body: t('push.routeActiveBody') });
      return;
    }
    simRef.current?.stop();
    mapHook.setWalkersDimmed(true);
    setShowSheet(true);
  };
  const closeRouteSheet = () => {
    setShowSheet(false);
    mapHook.setWalkersDimmed(false);
    if (!activeRouteRef.current) mapHook.clearPlanning();
    simRef.current?.start();
  };

  // Draw the route as the user's own and start navigating it.
  const driveRoute = (route: OsrmRoute, coords: LatLng[]) => {
    mapHook.setRouteLines([]);
    mapHook.renderUserRoute(coords, mapStyleRef.current);
    mapHook.fitRoute(coords);
    startUserNav(route, coords);
  };

  // Live mode: share the route over presence so watching walkers see it, and
  // turn on live-location sharing (the Free Mode switch reflects it).
  const shareRoute = (route: OsrmRoute, coords: LatLng[]) => {
    sharedRouteRef.current = { route, coords };
    presenceClient.publishRoute(toRoutePublishDto(coords, route)).catch(() => {});
    setFreeMode(true);
  };

  // Auto-resume: redraw the retained session's Live trip on reopen — recompute
  // the road between its persisted origin/destination, draw it, re-share it over
  // presence and resume navigation. Planned trips restore the map/mode only.
  const restoreLiveRoute = async (trip: any) => {
    try {
      if (String(trip.category || '').toLowerCase() !== 'live') return;
      const from = [trip.origin?.latitude, trip.origin?.longitude];
      const to = [trip.destination?.latitude, trip.destination?.longitude];
      if (from.some((v) => v == null) || to.some((v) => v == null)) return;
      const [route] = await getRoute([from, to] as LatLng[]);
      if (!route?.geometry) return;
      const coords = routeCoords(route);
      liveTripIdRef.current = String(trip.id);
      shareRoute(route, coords);
      driveRoute(route, coords);
    } catch { /* restore is best-effort; the map still works without it */ }
  };
  // Expose the latest restoreLiveRoute to usePresence (declared above it).
  restoreLiveRouteRef.current = restoreLiveRoute;

  const handleRouteSelected = async (route: OsrmRoute | null, waypoints: RouteWaypoint[]) => {
    setShowSheet(false);
    if (!route?.geometry) return;
    const coords = routeCoords(route);

    if (USE_MOCKS) {
      // Demo: regenerate simulated walkers along the chosen route.
      const userLoc = userLocRef.current || randomUserLocation();
      userLocRef.current = userLoc;
      await runSimulation(userLoc, () => generateWalkersForRoute(coords, opposite(mode), simStore.get()), 'push.routeMatchTitle');
    } else {
      // Live: keep real walkers on the map, share the route and persist the
      // journey as a Live trip (restorable on reopen). Creating a route engages
      // the viewer, so the planned-trips board hides.
      mapHook.setWalkersDimmed(false);
      shareRoute(route, coords);
      setHasCreatedTrip(true);
      createLiveTrip(route, coords, waypoints, mode as PartyType).then((id) => { if (id) liveTripIdRef.current = id; });
    }
    driveRoute(route, coords);
  };

  const finishRoute = () => {
    sharedRouteRef.current = null;
    endRoute();
  };

  const handleMapTask = async (task: MapTask) => {
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
      simRef.current?.stop();
      mapHook.hideWalkers(true);
      mapHook.clearPreviewRoute();
      let route: LatLng[] | null = null;
      let pos: LatLng | null = c.latlng;
      if (c.hasRoute && c.fromLatlng && c.toLatlng) {
        route = (await RouteServer.fetch({ id: c.id, fromLatlng: c.fromLatlng, toLatlng: c.toLatlng })).coords;
        if (route.length > 1) pos = splitRoute(route, 0.42).position || pos;
      }
      mapHook.showContactFocus({ ...c, latlng: pos, route, color: partyColor(c.type) });
      const pts = [userLocRef.current, pos, ...(route || [])].filter((p): p is LatLng => !!p);
      if (pts.length) mapHook.fitPoints(pts);
    } else if (task.type === 'contactClear') {
      mapHook.clearPreviewRoute();
      mapHook.hideWalkers(false);
      simRef.current?.start();
      mapHook.fitWalkers(userLocRef.current, simWalkersRef.current);
    }
  };

  const finishPick = (point: Place) => {
    setNavTask((task) => { if (task?.type === 'pick') task.onDone(point); return null; });
    mapHook.setWalkersDimmed(false);
  };
  const cancelTask = () => {
    mapHook.clearPreviewRoute();
    mapHook.setWalkersDimmed(false);
    setNavTask(null);
  };

  const openChat = (peer: ChatPeer | CallUser) => setChatUser(peer);

  const saveContact = async (user: { id: string; name: string }) => {
    try {
      const result = await addContact(String(user.id));
      notify({ title: result === 'added' ? t('contacts.added') : t('contacts.already'), body: user.name });
    } catch (e) {
      notify({ title: t('contacts.addFailed'), body: errorMessage(e) });
    }
  };

  // "Bandman" — mark yourself full so you drop out of discovery, and back again.
  // Lives in the side drawer next to Free Mode; both write through the same
  // pattern (local state → walkerStateStore → server), so the two status
  // toggles stay in step whichever one the user flips.
  const toggleBanded = () => {
    const next = !banded;
    setBanded(next);
    publishBanded(next, liveTripIdRef.current || walkerStateStore.get().activeTripId);
  };

  const exitToHome = () => {
    setScreen('home'); setShowSheet(false);
    clearToasts(); // drop any queued arrival toasts from the session we're leaving
    stopNav();
    // Leaving the map abandons the journey deliberately: withdraw the shared
    // route and call off the backing Live trip (it is simply closed).
    closeLiveTrip(liveTripIdRef.current, 'cancel');
    liveTripIdRef.current = null;
    sharedRouteRef.current = null;
    setFreeMode(false); // stop sharing our live location when leaving the map
    setHasCreatedTrip(false); // reset engagement when leaving the map
    if (banded) { setBanded(false); publishBanded(false, null); }
    activeRouteRef.current = null; setActiveRoute(null); setNavProgress(0);
    mapHook.clearUserRoute(); mapHook.clearPlanning();
    stopSim();
    mapHook.clearWalkers(); userLocRef.current = null;
    setWalkerCount(null); setAreaName(null); setLocationOff(false);
  };

  // Switching role ends an active journey — say so and ask first.
  const requestExit = async () => {
    setDrawerOpen(false);
    if (activeRouteRef.current || liveTripIdRef.current) {
      const ok = await confirmAction({
        title: t('drawer.exitConfirmTitle'), body: t('drawer.exitConfirmBody'),
        confirmLabel: t('drawer.exitConfirmBtn'), danger: true,
      });
      if (!ok) return;
    }
    exitToHome();
  };

  const visibility: Visibility = USE_MOCKS ? 'visible'
    : banded ? 'busy'
      : freeMode ? 'visible'
        : mode === 'driver' ? 'hidden-driver' : 'hidden-passenger';

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      background: T.bg, fontFamily: 'DM Sans,sans-serif' }}>

      {/* OSM Map — always mounted when screen=map */}
      <div ref={mapContainerRef} aria-hidden={screen !== 'map'}
        style={{ position: 'absolute', inset: 0, zIndex: 0,
          display: screen === 'map' ? 'block' : 'none' }} />

      {screen === 'loading' && (authError
        ? <AuthErrorScreen error={authError} onRetry={() => { retryBoot(); setLoaderDone(false); }} />
        : <LoadingScreen onDone={() => setLoaderDone(true)} />)}

      {screen === 'home' && (
        <HomeScreen onSelect={(m) => { setMode(m); walkerStateStore.patch({ role: m }); setScreen('map'); }} />
      )}

      {/* The map chrome stays mounted during a call (the call screen covers it),
          so an open form or panel is exactly as the user left it afterwards. */}
      {screen === 'map' && (
        <>
          <MapUI
            mode={mode as PartyType}
            mapHook={mapHook}
            routeActive={!!activeRoute}
            activeRoute={activeRoute}
            navProgress={navProgress}
            onEndRoute={finishRoute}
            gpsIssue={gpsIssue}
            onRouteSheet={openRouteSheet}
            userLoc={userLocRef.current}
            onMapTask={handleMapTask}
            navHidden={!!navTask}
            onMenu={() => setDrawerOpen(true)}
            onContactCall={(c) => handleCall(contactToUser(c))}
            onContactSms={(c) => openChat(contactToUser(c))}
            onOpenChat={openChat}
            onOpenMyTrips={() => setOverlayPanel('myTrips')}
            mapStyleMode={mapStyleMode}
            appTheme={themeStore.mode}
            onMapStyleChange={changeMapStyleMode}
            follow={followMe}
            onToggleFollow={() => setFollowMe((f) => !f)}
            engaged={engaged}
            onTripCreated={(tripId) => {
              setHasCreatedTrip(true);
              if (tripId && tripId !== true) walkerStateStore.patch({ activeTripId: String(tripId) });
            }}
            areaName={areaName}
            locationOff={locationOff}
            onRetryLocation={retryLocation}
            realtime={realtime}
            visibility={visibility}
            walkerCount={walkerCount}
          />
          <SideDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            mode={mode as PartyType}
            freeMode={freeMode}
            // Free Mode (destination-less live sharing) is driver-only; passengers
            // become visible by creating a trip instead. See business-spec §9.3.
            onToggleFreeMode={() => { if (mode === 'driver') setFreeMode((f) => !f); }}
            // Band ("to'ldi"): once the walker has a discoverable trip they can
            // mark themselves full — hidden from search/maps — and back again.
            // No booking or seat accounting; just a reversible visibility flag.
            banded={banded}
            canBand={hasCreatedTrip}
            onToggleBanded={toggleBanded}
            onExit={requestExit}
            onOpenPanel={(key) => { setDrawerOpen(false); setOverlayPanel(key); }}
          />
          {showSheet && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none' }}>
              <RouteSheet
                mapHook={mapHook}
                userLoc={userLocRef.current}
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
              onChat={() => { openChat(selectedUser); setSelectedUser(null); }}
              onAddContact={!USE_MOCKS && isRealUserId(selectedUser.id) ? () => saveContact(selectedUser) : undefined}
            />
          )}
          <PushToast
            notif={toast}
            exiting={toastExiting}
            onDismiss={dismissToast}
            onView={(n) => {
              dismissToast();
              if (n?.chat && n.user) openChat(n.user as CallUser);
              else if (n?.user) setSelectedUser(n.user);
            }}
          />

          {navTask?.type === 'pick' && (
            <MapPickOverlay
              mapHook={mapHook}
              label={navTask.label}
              initial={navTask.initial}
              onConfirm={finishPick}
              onCancel={cancelTask}
            />
          )}
          {navTask?.type === 'preview' && (
            <WalkerPreviewCard
              task={navTask}
              onBack={cancelTask}
              onCall={(w) => { cancelTask(); handleCall(walkerToCallUser(w)); }}
              onChat={(w) => { cancelTask(); openChat(walkerToCallUser(w)); }}
            />
          )}
        </>
      )}

      {/* On-demand overlay screens: each isolated by its own error boundary so a
          failure in one (call, chat, a panel) can't take down the map, and lazy
          so they stay out of the initial bundle. */}
      <ErrorBoundary onReset={closeOverlays}>
        <Suspense fallback={null}>
          {chatUser && (
            <ChatScreen user={chatUser} onBack={() => setChatUser(null)}
              onCall={(u) => { setChatUser(null); handleCall(u as CallUser); }} />
          )}

          {callState && (
            <CallScreen
              callee={callState.user}
              phase={callState.phase}
              live={!!callState.live}
              role={callState.role || 'caller'}
              offer={callState.offer}
              onOffer={offerRide}
              onRespondOffer={respondRide}
              onAccept={handleAcceptCall}
              onMuteToggle={(m) => callState.live && callClient.setMuted(m)}
              onDecline={declineCall}
              onEnd={endCall}
            />
          )}

          {overlayPanel === 'settings' && <SettingsScreen onClose={() => setOverlayPanel(null)} />}
          {overlayPanel === 'complaint' && <ComplaintScreen onClose={() => setOverlayPanel(null)} />}
          {overlayPanel === 'privacy' && <PrivacyScreen onClose={() => setOverlayPanel(null)} />}
          {overlayPanel === 'myTrips' && (
            <MyTripsScreen onClose={() => setOverlayPanel(null)}
              onChanged={(open) => setHasCreatedTrip(open > 0 || !!activeRouteRef.current)} />
          )}
        </Suspense>
      </ErrorBoundary>

      <ConfirmHost />

      {sessionLost && <AuthErrorScreen variant="session" onRetry={() => window.location.reload()} />}
    </div>
  );
}
