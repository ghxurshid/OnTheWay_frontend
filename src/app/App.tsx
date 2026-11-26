/* ════════════════════════════════════════════════════════════════
   App — top-level screen orchestrator + map/simulation controller.
   Holds screen routing (loading → home → map), owns the map hook, and
   drives the walker simulation, routing, calls, chat and push toasts.
   All data flows through services/hooks; no mock import lives here.
   ════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { T, themeStore, partyColor } from '@/constants/theme';
import { t } from '@/i18n';
import { TASHKENT } from '@/constants/map';
import { randomChatReplyKey } from '@/constants/app';
import { haversineKm, routeMatchPercent, splitRoute } from '@/utils/geo';
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
import { useWalkerAlert } from '@/hooks/useWalkerAlert';
import { useCompanionRating } from '@/hooks/useCompanionRating';
import { usePresence } from '@/hooks/usePresence';
import type { PendingRestore } from '@/hooks/usePresence';
import { useTripNavigation } from '@/hooks/useTripNavigation';
import type { NavRoute } from '@/hooks/useTripNavigation';
import { useToastQueue } from '@/hooks/useToastQueue';
import { useRealtimeStatus } from '@/hooks/useRealtimeStatus';
import { useTripStarted } from '@/hooks/useTripStarted';
import {
  createSimulation, generateWalkers, generateWalkersForRoute, randomUserLocation,
} from '@/services/simulationService';
import type { SimWalker, Simulation } from '@/services/simulationService';
import { SIM_COUNT_EVENT, simStore } from '@/services/simStore';
import { UNREAD_EVENT, unreadStore } from '@/services/unreadStore';
import { RouteServer, getRoute, routeCoords, toRoutePublishDto } from '@/services/routeService';
import type { OsrmRoute, RouteEndLabels } from '@/services/routeService';
import { reverseGeocode } from '@/services/geocodingService';
import { closeLiveTrip, createLiveTrip, createRouteStarts, forgetCompanion, publishBanded, recordedCompanions } from '@/services/liveTripService';
import type { RouteWaypoint } from '@/services/liveTripService';
import { getCurrentLatLng } from '@/services/geolocation';
import { addContact, CONTACTS_EVENT, contactRoster } from '@/services/contactService';
import { useStoreEvent } from '@/hooks/useStoreEvent';
import { authStore } from '@/services/authStore';
import { confirmAction } from '@/services/confirm';
import { setClosingConfirmation, haptic, shareText, telegramColorScheme } from '@/services/telegram';
import { prefsStore } from '@/services/prefsStore';
import { blockStore, BLOCK_EVENT } from '@/services/blockStore';
import { agreementStore } from '@/services/agreementStore';
import type { AgreementPeer } from '@/services/agreementStore';
import { agreementService } from '@/services/agreementService';
import { walkerAlertService } from '@/services/walkerAlertService';
import { tripOutbox } from '@/services/tripOutbox';
import { journeyRating } from '@/services/journeyRating';
import { savedStore } from '@/services/savedStore';
import { readJson, writeJson } from '@/utils/storage';
import { fmt12 } from '@/utils/datetime';
import { usePrefs } from '@/hooks/usePrefs';
import { peekDeepLink, takeDeepLink } from '@/services/deepLink';
import {
  bandPlanIdOf, bandTargets, isInProgress, onMyTrips, planLaunch, readOpenTrips, settleLate, tripRole,
} from '@/services/tripResume';
import type { LaunchPlan, TripDto } from '@/services/tripResume';
import { startLocationReporting, stopLocationReporting, callClient, chatClient, presenceClient } from '@/services/realtime';
import { walkerStateStore } from '@/services/walkerStateStore';
import { chatApi, markMockRead, recordMockIncoming } from '@/api/chatApi';
import type { ChatMessageDto } from '@/api/chatApi';
import { walkerApi } from '@/api/walkerApi';
import { SESSION_LOST_EVENT, USE_MOCKS } from '@/api/client';
import type { ActiveRoute, LatLng, MapTask, PartyType, Place, PushNotif, RouteData, Walker } from '@/models';

import { LoadingScreen } from '@/pages/LoadingScreen';
import { AuthErrorScreen } from '@/pages/AuthErrorScreen';
import { HomeScreen } from '@/pages/HomeScreen';
import { OnboardingScreen } from '@/pages/OnboardingScreen';
import { MapUI } from '@/features/matching/MapUI';
import type { Visibility } from '@/features/matching/MapUI';
import { UserPopup } from '@/features/matching/UserPopup';
import { WalkerPreviewCard } from '@/features/matching/WalkerPreviewCard';
import { AgreedRideCard } from '@/features/matching/AgreedRideCard';
import type { MapPerson } from '@/features/matching/types';
import { TripSummary } from '@/features/trips/TripSummary';
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
const ProfileScreen = lazy(() => import('@/features/settings/ProfileScreen').then((m) => ({ default: m.ProfileScreen })));

type Screen = 'loading' | 'home' | 'map';

/** The in-map overlay task: a map-pick sheet or a walker route preview. */
type NavTask =
  | { type: 'pick'; label: string; initial: LatLng | null; onDone: (point: Place) => void }
  | { type: 'preview'; walker: Walker; loading: boolean; dist: number; data?: RouteData };

const opposite = (role: PartyType | null): PartyType => (role === 'driver' ? 'passenger' : 'driver');
const byDistanceFrom = (from: LatLng, at: (w: SimWalker) => LatLng | null | undefined) =>
  (a: SimWalker, b: SimWalker) => haversineKm(from, at(a)) - haversineKm(from, at(b));

// Demo only: stable car colour + number plate per simulated driver, so the
// card shows what a real driver profile would (see ProfileScreen).
const DEMO_COLORS = ['colorWhite', 'colorBlack', 'colorSilver', 'colorGrey', 'colorBlue', 'colorRed'];
function demoCar(id: string, model: string | null | undefined): string | null {
  if (!model) return null;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const L = 'ABDEHKLMNOPSTXYZ';
  const plate = `${String(10 + (h % 80)).padStart(2, '0')} ${L[h % L.length]} ${String(100 + (h % 900))} ${L[(h >>> 3) % L.length]}${L[(h >>> 7) % L.length]}`;
  return [model, t(`profile.${DEMO_COLORS[h % DEMO_COLORS.length]}`), plate].join(' · ');
}

/** The other party of an agreement as a call / chat peer. */
const peerToUser = (p: AgreementPeer): CallUser => ({ id: p.id, type: p.type, name: p.name, initials: p.initials, sub: p.vehicle || '' });

/** The finished trip's summary; `tripId` is the trip the partner is rated on (null: none) and
    `route` what "same route again" starts from (default: my last route). */
interface TripSummaryData {
  distanceKm: number; durationMin: number; partner: AgreementPeer | null; tripId: string | null;
  route?: { from: Place | null; to: Place | null };
}

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
  const { current: toast, exiting: toastExiting, push: pushToast, dismiss: dismissToast, clear: clearToasts } = useToastQueue();
  const prefs = usePrefs();
  // Toasts respect the notification settings, quiet mode and open panels:
  // while a panel or screen is up only high-priority ones (calls, agreements)
  // interrupt — the unread badges carry the rest. Bursts of "new match" toasts
  // are folded into one summary.
  const panelOpenRef = useRef(false);
  const overlayOpenRef = useRef(false);
  const matchGroupRef = useRef<{ n: number; timer: ReturnType<typeof setTimeout> | null }>({ n: 0, timer: null });
  const modeRef = useRef<PartyType | null>(null);
  const notify = useCallback((n: PushNotif) => {
    const p = prefsStore.get();
    const kind = n.kind || (n.chat ? 'chat' : 'info');
    const high = n.priority === 'high' || kind === 'call' || kind === 'agree';
    if (!high) {
      if (p.quiet) return;
      if (kind === 'chat' && !p.notifChat) return;
      if (kind === 'match' && !p.notifMatch) return;
      if (panelOpenRef.current || overlayOpenRef.current) return;
    }
    if (kind === 'match') {
      const g = matchGroupRef.current;
      if (g.timer) { g.n += 1; return; }
      g.timer = setTimeout(() => {
        const extra = g.n;
        g.n = 0; g.timer = null;
        if (extra > 0 && !prefsStore.get().quiet && !panelOpenRef.current && !overlayOpenRef.current) {
          pushToast({ title: modeRef.current === 'driver' ? t('mapx.groupedPassengers', { n: extra }) : t('mapx.groupedDrivers', { n: extra }),
            body: t('mapx.view'), kind: 'match' });
        }
      }, 30_000);
    }
    pushToast(n);
  }, [pushToast]);
  // Dev-only hook so layout QA can fire a toast without waiting for the simulation.
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    (window as unknown as { __otwToast?: typeof pushToast }).__otwToast = pushToast;
    return () => { delete (window as unknown as { __otwToast?: unknown }).__otwToast; };
  }, [pushToast]);
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
  const [overlayPanel, setOverlayPanel] = useState<string | null>(null); // 'settings' | 'complaint' | 'privacy' | 'myTrips' | 'profile'
  const [onboarded, setOnboarded] = useState(() => prefsStore.get().onboarded);
  const [summary, setSummary] = useState<TripSummaryData | null>(null);
  const [summaryQueue, setSummaryQueue] = useState<TripSummaryData[]>([]); // companions' trips, waiting for a free screen
  const [createInitial, setCreateInitial] = useState<{ from?: Place | null; to?: Place | null } | null>(null);
  const [complaintInitial, setComplaintInitial] = useState<{ cat?: string; subject?: string; userId?: string } | null>(null);
  const notifyMeOn = useWalkerAlert(); // "tell me when someone appears" - kept on the server, outlives the app
  const lastRouteRef = useRef<{ from: Place | null; to: Place | null } | null>(null);
  const autoOfferRef = useRef<string | null>(null);   // live: offer to ride once this call connects
  const callActiveSinceRef = useRef<number | null>(null);
  // `?qa` (dev only) skips the splash so layout QA harnesses land on the map at once.
  const [loaderDone, setLoaderDone] = useState(() => !!import.meta.env.DEV && /[?&]qa\b/.test(window.location.search));
  const [sessionLost, setSessionLost] = useState(false);
  const [locationOff, setLocationOff] = useState(false);
  const [areaName, setAreaName] = useState<string | null>(null);
  const [walkerCount, setWalkerCount] = useState<number | null>(null);
  const pendingRestoreRef = useRef<PendingRestore | null>(null); // journey to redraw once the map is up in its role
  const liveTripIdRef = useRef<string | null>(null);      // the journey on the map: the trip behind the route
  const plannedTripIdRef = useRef<string | null>(null);   // my plan "band" acts on (never the session's trip)
  const lateSettleRef = useRef(false);                    // the launch could not read my trips: the first read settles them
  const myTripsRef = useRef<TripDto[] | null>(null);      // my open trips as last read (null: not read yet)
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const userLocRef = useRef<LatLng | null>(null);
  const simRef = useRef<Simulation | null>(null);
  const simWalkersRef = useRef<SimWalker[]>([]);
  const mapStyleRef = useRef(mapStyle);
  const activeRouteRef = useRef<NavRoute | null>(null);   // shared: current trip route (nav + free-mode + exit)
  const liveWalkersRef = useRef<Map<string, any>>(new Map()); // userId → enriched live walker

  const mapHook: MapHook = useMap(mapContainerRef, screen === 'map');

  // One-time auth + realtime + session-restore boot (owns readiness/error state).
  const { authReady, sessionReady, authError, restoredSessionRef, openTripsRef, contactsRef, retry: retryBoot } = useBootstrap();
  const contactIds = useStoreEvent(CONTACTS_EVENT, contactRoster.ids); // "Add to contacts" follows it live

  // Leave the splash once the loader bar, auth AND the session snapshot (with my
  // open trips) are ready. A journey of mine under way (see services/tripResume:
  // the session's, a bot link's, or a plan the server started) resumes STRAIGHT
  // onto the map in its role — no mode-selection screen — and is queued so its
  // route is redrawn once the map is up. A plan still waiting on the board is
  // never the session's trip; it only keeps the viewer engaged.
  useEffect(() => {
    if (screen !== 'loading' || !loaderDone || !authReady || !sessionReady || authError) return;
    const link = peekDeepLink();
    // Otherwise open straight onto the map in the role picked last time (the
    // top bar switches it); only a first run sees the role choice.
    const last = prefsStore.get().onboarded ? prefsStore.get().lastRole : null;
    const plan = planLaunch({
      sessionTrip: restoredSessionRef.current?.activeTrip, open: openTripsRef.current,
      engaged: walkerStateStore.get().engaged, linkedTripId: link?.kind === 'trip' ? link.tripId : null,
      role: last, agreement: !!agreementStore.get(),
    });
    if (!USE_MOCKS) settleRestoredSession(plan);
    setHasCreatedTrip(plan.hasOpenTrip);
    plannedTripIdRef.current = plan.plannedTripId;
    if (plan.resume) {
      resumeJourney(plan.resume);
    } else if (last) {
      setMode(last);
      walkerStateStore.patch({ role: last });
      setScreen('map');
    } else {
      setScreen('home');
    }
    // "Your trip has started" for a plan the server started; one that waits for its
    // turn is remembered; unknown trips are read again later (see useTripStarted).
    if (!USE_MOCKS) tripStarted.launched(plan);
    if (plan.openMyTrips) setOverlayPanel('myTrips');
  }, [screen, loaderDone, authReady, sessionReady, authError]); // eslint-disable-line react-hooks/exhaustive-deps -- restoredSessionRef / openTripsRef are stable refs

  // The server retained this walker's presence from before the app was closed.
  // Decide now what of it still holds, so it matches what the app shows: "band"
  // as planLaunch decided (left as the session has it while my trips are unknown —
  // then the first read of them settles it, see onMyTrips below); only a journey
  // under way — its route is redrawn and re-shared — keeps the session's trip and
  // the live location; anything else is dropped, or the old position would linger
  // on others' maps.
  const settleRestoredSession = ({ resume, banded: bandedNow, showPlanId }: LaunchPlan) => {
    if (bandedNow === null) {
      setBanded(walkerStateStore.get().engaged);
      lateSettleRef.current = true;
    } else {
      setBanded(bandedNow);
      publishBanded(bandedNow, showPlanId);
    }
    if (resume) return;
    presenceClient.clearRoute().catch(() => {});
    if (walkerStateStore.get().activeTripId) walkerStateStore.patch({ clearActiveTrip: true });
    walkerStateStore.patch({ freeMode: false });
    presenceClient.stopSharing().catch(() => {});
  };

  // Every read of my open trips (the launch, a catch-up, My trips, the board):
  // "band" acts on the plan it lists, and going live asks about the plans it
  // replaces from it. After a launch that could not read them, the first read
  // settles what that launch left open.
  useEffect(() => onMyTrips((trips) => {
    myTripsRef.current = trips;
    plannedTripIdRef.current = bandPlanIdOf(trips);
    if (!lateSettleRef.current) return;
    lateSettleRef.current = false;
    const late = settleLate(trips, { journey: !!(activeRouteRef.current || liveTripIdRef.current), banded: walkerStateStore.get().engaged });
    setHasCreatedTrip(late.hasOpenTrip);
    if (late.unband) { setBanded(false); publishBanded(false, null); }
  }), []);

  // A session that could not be renewed: stop and ask the user to sign in
  // again, instead of every screen quietly showing empty data.
  useEffect(() => {
    const onLost = () => setSessionLost(true);
    window.addEventListener(SESSION_LOST_EVENT, onLost);
    return () => window.removeEventListener(SESSION_LOST_EVENT, onLost);
  }, []);

  // First run inside Telegram: follow Telegram's light/dark scheme.
  useEffect(() => {
    const scheme = telegramColorScheme();
    if (scheme && readJson<string | null>('otw-theme-picked', null) == null && themeStore.mode !== scheme) themeStore.set(scheme);
    writeJson('otw-theme-picked', true);
  }, []);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { overlayOpenRef.current = !!(chatUser || overlayPanel || summary || drawerOpen); }, [chatUser, overlayPanel, summary, drawerOpen]);

  useEffect(() => { mapHook.setMapStyle(mapStyle); }, [mapStyle, screen]); // eslint-disable-line react-hooks/exhaustive-deps -- mapHook is stable

  // Ask before Telegram closes the app while a journey is under way.
  useEffect(() => { setClosingConfirmation(!!activeRoute); }, [activeRoute]);

  const formatForPopup = useCallback((w: any): MapPerson => {
    const here = userLocRef.current;
    const km = here && w.position ? haversineKm(here, w.position) : null;
    const vehicle = USE_MOCKS && w.vehicle && !String(w.vehicle).includes('·') ? demoCar(String(w.id), w.vehicle) : (w.vehicle || null);
    const etaMin = km != null ? Math.max(1, Math.round(km / 0.4)) : null;
    return {
      id: w.id, type: w.type, initials: w.initials, name: w.name, color: w.color,
      sub: w.type === 'driver' ? (vehicle || t('common.driver')) : t('userPopup.sub'),
      dist: km != null ? t('common.km', { n: km.toFixed(1) }) : '—',
      eta: etaMin != null ? t('common.minutes', { n: etaMin }) : '—',
      distKm: km, etaMin,
      rating: (typeof w.rating === 'number' ? w.rating.toFixed(1) : (w.rating ?? '—')),
      trips: w.trips ?? 0, sharedTrips: w.sharedTrips ?? 0, latlng: w.position,
      // A green "0%" misleads: no overlap reads the same as no route (sorted by distance).
      match: w.match ?? (routeMatchPercent(activeRouteRef.current?.coords ?? [], w.routePoints ?? []) || undefined),
      offline: !!w.offline,
      vehicle: w.type === 'driver' ? vehicle : null, seats: w.type === 'driver' ? (w.seats ?? null) : null,
      startLatlng: w.start || (w.route && w.route[0]) || null,
      destLatlng: w.dest || (w.route && w.route[w.route.length - 1]) || null,
      startLabel: w.startLabel || null, destLabel: w.destLabel || null,
      note: w.note || null,
    };
  }, []);

  const findWalker = (id: string): any => simWalkersRef.current.find((x) => x.id === id) || liveWalkersRef.current.get(id) || null;

  const openWalker = useCallback((id: string) => {
    if (blockStore.has(id)) return;
    const w = simWalkersRef.current.find((x) => x.id === id) || liveWalkersRef.current.get(id);
    if (w) setSelectedUser(formatForPopup(w));
  }, [formatForPopup]);

  /** Everyone on the map right now (list view), blocked people left out. */
  const listPeople = useCallback((): MapPerson[] => [...simWalkersRef.current, ...liveWalkersRef.current.values()]
    .filter((w) => !blockStore.has(w.id)).map(formatForPopup), [formatForPopup]);

  /** "Chilonzor → … · 0.5 km · ~2 min" style context line for calls / chats. */
  const personContext = (id: string | number | null | undefined): string | null => {
    const w = id != null ? findWalker(String(id)) : null;
    if (!w) return null;
    const p = formatForPopup(w);
    return [p.type === 'driver' ? p.vehicle : null, p.distKm != null ? t('agree.away', { km: p.distKm.toFixed(1), min: p.etaMin }) : null]
      .filter(Boolean).join(' · ') || null;
  };

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
    const shown = enriched.filter((w) => !blockStore.has(w.id));
    setWalkerCount(shown.length);
    mapHook.renderWalkers(shown, mapStyleRef.current, openWalker);
    mapHook.fitWalkers(userLoc, shown);
    sim.start();
    const [nearest] = shown.slice().sort(byDistanceFrom(userLoc, (w) => w.position));
    if (nearest) {
      const f = formatForPopup(nearest);
      notify({ title: t(titleKey), body: `${f.name} • ${f.dist} • ${f.eta}`, user: f, kind: 'match' });
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
    if (simRef.current && screen === 'map') mapHook.renderWalkers(simWalkersRef.current.filter((w) => !blockStore.has(w.id)), mapStyle, openWalker);
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

  // The person I rode with completed their trip: the same summary, on their trip.
  useCompanionRating({
    authReady, activeRoute, activeRouteRef,
    onOffer: (offer) => setSummaryQueue((q) => [...q, { distanceKm: offer.distanceKm, durationMin: offer.durationMin,
      partner: offer.peer, tripId: offer.tripId, route: offer.route }]),
  });
  // Shown when nothing is in the way (it never replaces an open summary, and a
  // chat or a call keeps the screen until it is over).
  useEffect(() => {
    if (summary || !summaryQueue.length || chatUser || callState || screen === 'loading') return;
    setSummary(summaryQueue[0]);
    setSummaryQueue((q) => q.slice(1));
  }, [summary, summaryQueue, chatUser, callState, screen]);

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
  // The initial `false` is not a decision — whether a restored session still
  // shares its location is settled once the session snapshot is in (see
  // settleRestoredSession). Every change after that is the user's.
  const freeModeInitRef = useRef(true);
  useEffect(() => {
    if (freeModeInitRef.current) { freeModeInitRef.current = false; return; }
    // Free Mode is a client-owned live field — mirror it into the session model
    // (which syncs to the server and is restored on reopen).
    walkerStateStore.patch({ freeMode });
    if (USE_MOCKS) return;
    if (freeMode) startLocationReporting();
    else { stopLocationReporting(); presenceClient.stopSharing().catch(() => {}); }
  }, [freeMode]);

  // Back after a loss: presenceClient has replayed role / location / route /
  // "band" already; re-send the session fields too (patches made while the
  // socket was down never arrived).
  useEffect(() => {
    if (USE_MOCKS) return undefined;
    return presenceClient.on('Reconnected', () => walkerStateStore.resync());
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
    // The server inbox is the truth for unread counts — on start and after every
    // reconnect (messages that arrived while the socket was down raised no event).
    // The chat on screen is being read, so it stays at zero.
    const refreshUnread = () => chatApi.conversations().then((rows) => {
      const open = chatUserRef.current ? idOf(chatUserRef.current.id) : null;
      unreadStore.replace(Object.fromEntries(rows.filter((r) => r.unreadCount > 0 && idOf(r.otherParticipantId) !== open)
        .map((r) => [idOf(r.otherParticipantId), r.unreadCount])));
    }).catch(() => { /* keep the local counts */ });
    refreshUnread();
    const offReconnected = chatClient.onReconnected(refreshUnread);

    const myId = idOf((authStore.getUser() as { id?: string } | null)?.id ?? '');
    const offMessage = chatClient.on('ReceiveMessage', (m: ChatMessageDto) => {
      const from = idOf(m.senderId);
      if (from === myId) return;
      // The sender's ✓✓: this device has it, whether or not that chat is open.
      chatClient.markDelivered(from, idOf(m.id)).catch(() => { /* the next connect sweep settles it */ });
      if (chatUserRef.current && idOf(chatUserRef.current.id) === from) return; // that chat is open
      unreadStore.add(from, 1);
      const user = chatPeerFor(from, m.senderName);
      notify({ title: t('chat.newFrom', { name: user.name.split(' ')[0] }), body: m.content, user, chat: true, action: t('chat.reply'), kind: 'chat' });
    });
    return () => { offReconnected(); offMessage(); };
  }, [authReady, chatPeerFor, notify]);

  useEffect(() => {
    if (!chatUser) return;
    unreadStore.clear(idOf(chatUser.id));
    if (USE_MOCKS) markMockRead(idOf(chatUser.id));
  }, [chatUser]);

  useEffect(() => {
    const sync = () => mapHook.setWalkerBadges(unreadStore.map());
    sync();
    window.addEventListener(UNREAD_EVENT, sync);
    return () => window.removeEventListener(UNREAD_EVENT, sync);
  }, [mapHook, screen]);

  // Demo-only: a random walker/contact "writes" every 25–45 s while the user is
  // neither chatting nor on a call (recorded in the mock inbox too, so the
  // Chats tab lists what the badge counts).
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
        if (!blockStore.has(target.id)) {
          const text = t(randomChatReplyKey());
          unreadStore.add(target.id, 1);
          recordMockIncoming(target, text);
          notify({ title: target.name, body: text, user: target, chat: true, action: t('chat.reply'), kind: 'chat' });
        }
      }
      timer = setTimeout(fire, 25000 + Math.random() * 20000);
    };
    timer = setTimeout(fire, 12000 + Math.random() * 8000);
    return () => clearTimeout(timer);
  }, [screen, mode, formatForPopup]); // eslint-disable-line react-hooks/exhaustive-deps -- contactsRef is a stable ref

  const openRouteSheet = () => {
    if (activeRouteRef.current) {
      notify({ title: t('push.routeActiveTitle'), body: t('push.routeActiveBody') });
      return;
    }
    // Going live replaces my plans departing around now: read my trips while the
    // route is being set up, so that starting it can ask about them at once.
    routeStarts.opened(USE_MOCKS ? null : readOpenTrips());
    simRef.current?.stop();
    mapHook.setWalkersDimmed(true);
    setShowSheet(true);
  };
  const closeRouteSheet = () => {
    routeStarts.closed(); // a start still waiting in it starts nothing
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
  const shareRoute = (route: OsrmRoute, coords: LatLng[], labels?: RouteEndLabels | null) => {
    presenceClient.publishRoute(toRoutePublishDto(coords, route, labels)).catch(() => {});
    setFreeMode(true);
  };

  // Auto-resume: redraw a journey of mine under way (a Live route, or a plan the
  // server started) — recompute the road between its persisted origin/destination,
  // draw it, re-share it over presence and resume navigation. A plan still
  // waiting for its departure is never drawn as a journey.
  const restoreLiveRoute = async (trip: any) => {
    const notSharing = () => { presenceClient.stopSharing().catch(() => {}); };
    try {
      if (!isInProgress(trip)) return;
      const from = [trip.origin?.latitude, trip.origin?.longitude];
      const to = [trip.destination?.latitude, trip.destination?.longitude];
      if (from.some((v) => v == null) || to.some((v) => v == null)) { notSharing(); return; }
      const [route] = await getRoute([from, to] as LatLng[]);
      if (!route?.geometry) { notSharing(); return; }
      const coords = routeCoords(route);
      liveTripIdRef.current = String(trip.id);
      shareRoute(route, coords, { from: trip.origin?.address, to: trip.destination?.address });
      driveRoute(route, coords);
    } catch {
      notSharing(); // restore is best-effort; the map still works without it
    }
  };
  // Expose the latest restoreLiveRoute to usePresence (declared above it).
  restoreLiveRouteRef.current = restoreLiveRoute;

  // A journey of mine under way goes on the map in its role: from now on it is the
  // journey (the session's active trip; a role switch asks first and calls it
  // off), and its route is drawn, shared and navigated — at once when the map is
  // up in that role, else by usePresence once it is.
  const resumeJourney = (trip: TripDto) => {
    const role = tripRole(trip);
    liveTripIdRef.current = idOf(trip.id);
    walkerStateStore.patch({ role, activeTripId: idOf(trip.id) });
    setHasCreatedTrip(true);
    if (screen === 'map' && mode === role) { restoreLiveRoute(trip); return; }
    if (mode && mode !== role) { walkerAlertService.disable(); setSelectedUser(null); } // set for the role being left
    pendingRestoreRef.current = { trip, role };
    setMode(role);
    setScreen('map');
  };

  // A journey of mine the server started (its departure time came): on the map,
  // or told and kept until nothing is in its way any more (see useTripStarted).
  const tripStarted = useTripStarted({
    authReady,
    ready: screen !== 'loading',
    now: () => ({
      activeTripId: liveTripIdRef.current || walkerStateStore.get().activeTripId,
      routeOnMap: !!activeRouteRef.current,
      busy: showSheet || !!navTask || !!callStateRef.current,
      mode, agreement: !!agreementStore.get(),
    }),
    blockers: [screen, mode, showSheet, !!activeRoute, !!navTask, !!callState].join('|'),
    resume: resumeJourney,
    notify,
  });

  // "Start" in the route sheet (createRouteStarts): it waits for the read of my
  // trips the sheet started and asks from my trips as last read by then; a start
  // the user walked away from meanwhile (Back, another route picked, the sheet
  // closed, the map left, the role switched) starts nothing.
  const [routeStarts] = useState(() => createRouteStarts({
    trips: () => (USE_MOCKS ? null : myTripsRef.current),
    waiting: () => tripStarted.waiting(),
    role: () => modeRef.current,
  }));
  // The sheet draws its route options through this: when they change (Back to
  // the address form, another one picked), a start still waiting is void.
  const sheetMapHook = useMemo<MapHook>(() => ({
    ...mapHook,
    setRouteLines: (routes: OsrmRoute[], primaryIdx?: number) => {
      routeStarts.routesChanged();
      mapHook.setRouteLines(routes, primaryIdx);
    },
  }), [mapHook, routeStarts]);

  const startRoute = async (route: OsrmRoute | null, waypoints: RouteWaypoint[]) => {
    // A new route ends whatever journey of mine is under way and replaces my plans
    // departing around now (the server calls them off): a journey that started
    // meanwhile and waits for its turn, and such plans, are asked about first — once.
    const outcome = await routeStarts.start(!!route?.geometry);
    if (outcome.kind === 'void') return; // walked away meanwhile, or one is under way
    if (outcome.kind === 'kept') {
      if (outcome.journey) { closeRouteSheet(); setCreateInitial(null); } // kept: it goes on the map now
      return; // nothing starts (a kept plan leaves the sheet as it was)
    }
    if (outcome.replaces) tripStarted.drop();
    setShowSheet(false);
    setCreateInitial(null);
    if (!route?.geometry) return;
    const { role } = outcome;
    const coords = routeCoords(route);
    const ends = waypoints.filter((w) => w.latlng);
    const asPlace = (w?: RouteWaypoint): Place | null => (w && w.latlng ? { latlng: w.latlng as LatLng, label: (w as { value?: string }).value || '' } : null);
    const picked = { from: asPlace(ends[0]), to: asPlace(ends[ends.length - 1]) };
    lastRouteRef.current = picked;

    if (USE_MOCKS) {
      // Demo: regenerate simulated walkers along the chosen route. A route
      // makes the user visible and engaged, like the live flow below.
      const userLoc = userLocRef.current || randomUserLocation();
      userLocRef.current = userLoc;
      setFreeMode(true);
      setHasCreatedTrip(true);
      await runSimulation(userLoc, () => generateWalkersForRoute(coords, opposite(role), simStore.get()), 'push.routeMatchTitle');
    } else {
      // Live: keep real walkers on the map, share the route and persist the
      // journey as a Live trip (restorable on reopen). Creating a route engages
      // the viewer, so the planned-trips board hides.
      mapHook.setWalkersDimmed(false);
      shareRoute(route, coords, { from: picked.from?.label, to: picked.to?.label });
      setHasCreatedTrip(true);
      createLiveTrip(route, coords, waypoints, role as PartyType).then((id) => {
        if (!id) return;
        liveTripIdRef.current = id;
        // The server called off my plans departing around now with it: read my
        // trips again, so "band" and the board's "your trip" let them go.
        void readOpenTrips();
      });
    }
    driveRoute(route, coords);
  };

  // One start at a time (routeStarts: a second tap while one waits or asks starts
  // nothing); once a route is on the map (the sheet may not be gone yet), nothing more.
  const handleRouteSelected = (route: OsrmRoute | null, waypoints: RouteWaypoint[]) => {
    if (activeRouteRef.current) return;
    void startRoute(route, waypoints);
  };

  // Finishing a trip shows its summary (distance, time, saving) and asks to
  // rate the companion of the agreement, if there was one.
  // The journey is over, so its agreements are fulfilled (the partner is told).
  const finishRoute = () => {
    const ar = activeRoute;
    const ag = agreementStore.get();
    // Read before endRoute() closes the trip. The partner may have finished first
    // (their agreement is gone then): see journeyRating for whom, and on which trip.
    const { partner, tripId } = journeyRating.forFinish({
      agreementPeer: ag && ag.status !== 'pending' ? ag.peer : null,
      myTripId: liveTripIdRef.current,
      myCompanions: recordedCompanions(),
    });
    endRoute();
    agreementService.complete();
    if (ar) setSummary({ distanceKm: ar.distanceKm, durationMin: ar.durationMin, partner, tripId });
  };

  // A real companion's rating goes to the server through the trip outbox, after
  // the trip's completion (queued by endRoute); demo walkers stay local.
  const rateCompanion = (peer: AgreementPeer, stars: number, tags: string[], tripId: string | null) => {
    const all = readJson<Record<string, { stars: number; tags: string[]; at: number }>>('otw-ratings', {});
    all[String(peer.id)] = { stars, tags, at: Date.now() };
    writeJson('otw-ratings', all);
    if (!USE_MOCKS && tripId && isRealUserId(peer.id)) {
      tripOutbox.enqueue({ kind: 'rate', tripId, rateeId: String(peer.id), stars, tags });
    }
    notify({ title: t('summary.thanks'), body: `${peer.name} · ${'★'.repeat(stars)}`, kind: 'info', priority: 'high' });
  };

  /** Share the journey (partner, car, destination, arrival) with someone close. */
  const shareTrip = async () => {
    const ar = activeRoute;
    if (!ar) return;
    const remMin = ar.liveEta ? ar.liveEta.remMin : Math.max(0, Math.round(ar.durationMin * (1 - navProgress)));
    const time = fmt12(new Date(Date.now() + remMin * 60000));
    const to = lastRouteRef.current?.to?.label || areaName || '';
    const ag = agreementStore.get();
    const text = ag && ag.status !== 'pending'
      ? t('share.withPartner', { name: ag.peer.name, car: ag.peer.vehicle || '—', to, time })
      : t('share.alone', { to, time });
    const how = await shareText(text);
    if (how === 'copied') notify({ title: t('share.copied'), body: text, priority: 'high' });
  };

  // ── Ride-together agreements outside a call ──
  // Demo walkers answer by themselves after a moment. A real person confirms
  // inside a call (both sides tap), so the app calls them and offers as soon
  // as the call connects.
  const offerRideTo = (u: MapPerson | CallUser) => {
    const peer: AgreementPeer = { id: String(u.id), name: u.name, initials: u.initials, type: u.type as PartyType,
      vehicle: (u as MapPerson).vehicle || null, latlng: (u as MapPerson).latlng || null };
    setSelectedUser(null);
    if (callStateRef.current) { offerRide(); return; }
    agreementStore.set({ peer, status: 'pending', since: Date.now() });
    if (USE_MOCKS || !isRealUserId(u.id)) {
      setTimeout(() => {
        const cur = agreementStore.get();
        if (!cur || cur.peer.id !== peer.id || cur.status !== 'pending') return;
        agreementStore.patch({ status: 'agreed' });
        haptic('success');
        const pid = 'partner-' + peer.id;
        if (!savedStore.has(pid)) savedStore.toggle({ id: pid, type: 'partner', initials: peer.initials, label: peer.name, sub: peer.vehicle || '', userId: peer.id, partyType: peer.type });
        notify({ title: t('agree.agreedTitle'), body: t('agree.accepted', { name: peer.name.split(' ')[0] }), kind: 'agree', priority: 'high' });
      }, 2600);
      return;
    }
    autoOfferRef.current = peer.id;
    handleCall(u as CallUser);
  };

  const cancelAgreement = async () => {
    const ag = agreementStore.get();
    if (!ag) return;
    if (ag.status !== 'pending') {
      const ok = await confirmAction({ title: t('agree.cancelConfirmTitle'), body: t('agree.cancelConfirmBody', { name: ag.peer.name.split(' ')[0] }),
        confirmLabel: t('agree.cancel'), cancelLabel: t('common.close'), danger: true });
      if (!ok) return;
    }
    autoOfferRef.current = null;
    forgetCompanion(ag.peer.id); // no journey together after all
    // The one confirmed above (the card may show another by now). The other
    // person is told over the server; an offline cancel is sent once back.
    agreementService.cancel(ag);
    notify({ title: t('agree.cancelled'), body: ag.peer.name, priority: 'high' });
  };

  const arrivedAtPickup = () => {
    // Recorded on the server for both (the other person gets a toast).
    const ag = agreementService.markArrived();
    if (!ag) return;
    haptic('success');
    // Tell them in the chat too (real users get it through the outbox).
    if (!USE_MOCKS && isRealUserId(ag.peer.id)) {
      import('@/services/chatOutbox').then(({ chatOutbox }) => chatOutbox.send(ag.peer.id, t('chat.quick6'))).catch(() => {});
    }
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

  // A bot "open in the app" button lands on its screen once the app is ready:
  // a chat (named from the walker's public profile) or My trips. A link to one
  // trip was settled by the launch already (planLaunch).
  useEffect(() => {
    if (screen === 'loading') return;
    const link = takeDeepLink();
    if (!link || link.kind === 'trip') return;
    if (link.kind === 'trips') {
      setOverlayPanel('myTrips');
      return;
    }
    walkerApi.profile(link.userId)
      .then((p): CallUser => (p
        ? { id: p.id, type: p.kind === 'driver' ? 'driver' : 'passenger', name: p.name, initials: initialsOf(p.name), sub: '' }
        : chatPeerFor(link.userId)))
      .catch(() => chatPeerFor(link.userId))
      .then(setChatUser);
  }, [screen, chatPeerFor]);

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
    publishBanded(next, bandTargets(next, liveTripIdRef.current || walkerStateStore.get().activeTripId, plannedTripIdRef.current));
  };

  // A plan published now waits on the board. It is NOT the session's trip (the
  // server's sweeper cancels that one with an abandoned session): it engages the
  // viewer, and "band" acts on it unless it acts on another plan already (one I
  // hid stays the one; the next read of my trips settles it).
  const planPublished = (tripId: unknown) => {
    setHasCreatedTrip(true);
    if (tripId && tripId !== true && !plannedTripIdRef.current) plannedTripIdRef.current = idOf(tripId);
  };

  const exitToHome = () => {
    setScreen('home'); setShowSheet(false);
    routeStarts.closed(); // a route start still waiting in the sheet starts nothing
    clearToasts(); // drop any queued arrival toasts from the session we're leaving
    stopNav();
    // Leaving the map abandons the journey deliberately: withdraw the shared
    // route and call off the backing Live trip (it is simply closed).
    closeLiveTrip(liveTripIdRef.current, 'cancel');
    liveTripIdRef.current = null;
    pendingRestoreRef.current = null; // a journey not drawn yet is left with the map
    setFreeMode(false); // stop sharing our live location when leaving the map
    setHasCreatedTrip(false); // reset engagement when leaving the map
    if (banded) { setBanded(false); publishBanded(false, plannedTripIdRef.current); } // my hidden plan shows again
    activeRouteRef.current = null; setActiveRoute(null); setNavProgress(0);
    mapHook.clearUserRoute(); mapHook.clearPlanning();
    stopSim();
    mapHook.clearWalkers(); userLocRef.current = null;
    setWalkerCount(null); setAreaName(null); setLocationOff(false);
  };

  // Switch passenger ⇄ driver right on the map (top bar / drawer). It ends an
  // active journey or agreement — say so and ask first.
  const switchRole = async () => {
    setDrawerOpen(false);
    if (activeRouteRef.current || liveTripIdRef.current || agreementStore.get()) {
      const ok = await confirmAction({
        title: t('drawer.exitConfirmTitle'), body: t('drawer.exitConfirmBody'),
        confirmLabel: t('drawer.exitConfirmBtn'), danger: true,
      });
      if (!ok) return;
    }
    const next = opposite(mode);
    exitToHome();
    agreementService.cancelAll(); // leaving the journey calls its agreements off for both
    walkerAlertService.disable(); // it was set for the role being left
    setSelectedUser(null);
    setMode(next);
    walkerStateStore.patch({ role: next });
    prefsStore.patch({ lastRole: next });
    tripStarted.roleChosen(next); // a started trip of the role left waits for that role
    setScreen('map');
    haptic('success');
    notify({ title: t('role.switchedTitle'), body: next === 'driver' ? t('role.nowDriver') : t('role.nowPassenger'), priority: 'high' });
  };

  const visibility: Visibility = banded ? 'busy'
    : freeMode ? 'visible'
      : mode === 'driver' ? 'hidden-driver' : 'hidden-passenger';

  // Settings → map markers: redraw the people in the chosen style.
  useEffect(() => { if (screen === 'map') mapHook.refreshWalkerIcons(); }, [prefs.markerStyle, screen]); // eslint-disable-line react-hooks/exhaustive-deps -- mapHook is stable

  // Blocking someone takes them off the map at once (and out of the list and the
  // unread badges);
  // unblocking a simulated walker brings them back (a live one returns through
  // usePresence, which listens too).
  useEffect(() => {
    const onBlock = () => {
      blockStore.list().forEach((id) => {
        mapHook.removeWalkerMarker(id);
        unreadStore.clear(id); // their conversation is hidden: so is its badge
      });
      if (simRef.current) mapHook.renderWalkers(simWalkersRef.current.filter((w) => !blockStore.has(w.id)), mapStyleRef.current, openWalker);
      setWalkerCount((n) => (n == null ? n : [...simWalkersRef.current, ...liveWalkersRef.current.values()].filter((w) => !blockStore.has(w.id)).length));
    };
    window.addEventListener(BLOCK_EVENT, onBlock);
    return () => window.removeEventListener(BLOCK_EVENT, onBlock);
  }, [mapHook, openWalker]);

  // "Tell me when someone appears": the server sets it off (a closed app gets a
  // Telegram message instead). The walker who did may not be counted on the map yet.
  useEffect(() => walkerAlertService.onFired(() => notify({
    title: t('push.walkerJoinedTitle'),
    body: t('status.' + (mode === 'driver' ? 'nearbyPassengers' : 'nearbyDrivers'), { n: Math.max(1, walkerCount ?? 0) }),
    priority: 'high',
  })), [notify, mode, walkerCount]);
  // Demo mode has no server: the first simulated walker sets it off.
  useEffect(() => {
    if (USE_MOCKS && notifyMeOn && walkerCount) walkerAlertService.fireLocally();
  }, [notifyMeOn, walkerCount]);

  // Calls: offer to ride once an auto-offer call connects; after a call, a
  // short "you talked to …" toast with the next step (write to them).
  const prevCallRef = useRef<typeof callState>(null);
  useEffect(() => {
    const prev = prevCallRef.current;
    prevCallRef.current = callState;
    if (callState?.phase === 'active') {
      if (!callActiveSinceRef.current) callActiveSinceRef.current = Date.now();
      if (autoOfferRef.current && String(callState.user.id) === autoOfferRef.current && callState.offer === 'none') {
        autoOfferRef.current = null;
        offerRide();
      }
    }
    if (prev && !callState) {
      const since = callActiveSinceRef.current;
      callActiveSinceRef.current = null;
      const ag = agreementStore.get();
      if (ag && ag.status === 'pending' && ag.peer.id === String(prev.user.id)) agreementStore.clear();
      autoOfferRef.current = null;
      if (since) {
        const secs = Math.round((Date.now() - since) / 1000);
        notify({ title: t('callx.endedTitle', { name: prev.user.name.split(' ')[0] }),
          body: `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`,
          user: prev.user, chat: true, action: t('callx.write'), kind: 'call' });
      }
    }
  }, [callState]); // eslint-disable-line react-hooks/exhaustive-deps -- offerRide/notify read the latest call through refs

  const finishOnboarding = () => { prefsStore.patch({ onboarded: true }); setOnboarded(true); };
  const peerLocation = (id: string): LatLng | null | undefined => findWalker(id)?.position;

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
        <HomeScreen onSelect={(m) => { setMode(m); walkerStateStore.patch({ role: m }); prefsStore.patch({ lastRole: m }); setScreen('map'); }} />
      )}
      {screen !== 'loading' && !onboarded && <OnboardingScreen onDone={finishOnboarding} />}

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
            mapStyleMode={mapStyleMode}
            appTheme={themeStore.mode}
            onMapStyleChange={changeMapStyleMode}
            follow={followMe}
            onToggleFollow={() => setFollowMe((f) => !f)}
            engaged={engaged}
            onTripCreated={planPublished}
            areaName={areaName}
            locationOff={locationOff}
            onRetryLocation={retryLocation}
            realtime={realtime}
            visibility={visibility}
            walkerCount={walkerCount}
            onSwitchRole={switchRole}
            freeMode={freeMode}
            banded={banded}
            canBand={hasCreatedTrip}
            // Free Mode (destination-less live sharing) is driver-only; passengers
            // become visible by creating a trip instead. See business-spec §9.3.
            onToggleFreeMode={() => { if (mode === 'driver') setFreeMode((f) => !f); }}
            // Band ("to'ldi"): once the walker has a discoverable trip they can
            // mark themselves full — hidden from search/maps — and back again.
            onToggleBanded={toggleBanded}
            listPeople={listPeople}
            onOpenPerson={openWalker}
            needsVehicle={mode === 'driver' && !prefs.vehicle}
            onOpenProfile={() => setOverlayPanel('profile')}
            onShareTrip={shareTrip}
            notifyMeOn={notifyMeOn}
            onNotifyMe={() => {
              walkerAlertService.enable(mode as PartyType, userLocRef.current).then((on) => {
                if (!on) notify({ title: t('mapui.locationOffTitle'), body: t('mapui.locationOffBody') });
              });
            }}
            onPanelChange={(open) => { panelOpenRef.current = open; }}
            onTripsChanged={(open) => setHasCreatedTrip(open > 0 || !!activeRouteRef.current)}
            toastOn={!!toast}
            agreementSlot={(
              <AgreedRideCard mode={mode as PartyType} userLoc={userLocRef.current} locate={peerLocation}
                onCall={(p) => handleCall(peerToUser(p))} onChat={(p) => openChat(peerToUser(p))}
                onArrived={arrivedAtPickup} onCancel={cancelAgreement} />
            )}
          />
          <SideDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            mode={mode as PartyType}
            onExit={switchRole}
            onOpenPanel={(key) => { setDrawerOpen(false); setOverlayPanel(key); }}
          />
          {showSheet && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none' }}>
              <RouteSheet
                mapHook={sheetMapHook}
                userLoc={userLocRef.current}
                onClose={() => { closeRouteSheet(); setCreateInitial(null); }}
                onShowRoute={handleRouteSelected}
                mode={mode as PartyType}
                initial={createInitial}
                onPlanned={planPublished}
                onOpenMyTrips={() => setOverlayPanel('myTrips')}
              />
            </div>
          )}
          {selectedUser && !showSheet && (
            <UserPopup
              user={selectedUser}
              onClose={() => setSelectedUser(null)}
              onCall={() => handleCall(selectedUser)}
              onChat={() => { openChat(selectedUser); setSelectedUser(null); }}
              onRide={() => offerRideTo(selectedUser)}
              onAddContact={!USE_MOCKS && isRealUserId(selectedUser.id) ? () => saveContact(selectedUser) : undefined}
              verified={USE_MOCKS || isRealUserId(selectedUser.id)}
              isContact={contactIds.includes(idOf(selectedUser.id))}
              ridesWithYou={selectedUser.sharedTrips}
              onReport={() => {
                setComplaintInitial({ cat: selectedUser.type === 'driver' ? 'driver' : 'passenger', subject: selectedUser.name, userId: idOf(selectedUser.id) });
                setSelectedUser(null);
                setOverlayPanel('complaint');
              }}
              onBlock={async () => {
                const u = selectedUser;
                const ok = await confirmAction({ title: t('popup.blockConfirmTitle', { name: u.name.split(' ')[0] }), body: t('popup.blockConfirmBody'),
                  confirmLabel: t('popup.block'), cancelLabel: t('common.close'), danger: true });
                if (!ok) return;
                // Hidden at once; undone (with the reason) if the server refuses.
                blockStore.add(u.id, { name: u.name })
                  .catch((e) => notify({ title: t('blocks.blockFailed'), body: errorMessage(e), priority: 'high' }));
                setSelectedUser(null);
                notify({ title: t('popup.blocked'), body: u.name, priority: 'high' });
              }}
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
              onCall={(u) => { setChatUser(null); handleCall(u as CallUser); }}
              context={personContext(chatUser.id)}
              myRole={mode || 'passenger'}
              myPlace={areaName}
              onShowOnMap={findWalker(String(chatUser.id)) ? () => {
                const w = findWalker(String(chatUser.id));
                setChatUser(null);
                if (w?.position) mapHook.flyTo(w.position, 16);
                openWalker(String(chatUser.id));
              } : undefined}
              onRide={screen === 'map' ? () => { const u = chatUser; offerRideTo(findWalker(String(u.id)) ? formatForPopup(findWalker(String(u.id))) : u); } : undefined} />
          )}

          {callState && (
            <CallScreen
              callee={callState.user}
              phase={callState.phase}
              live={!!callState.live}
              role={callState.role || 'caller'}
              offer={callState.offer}
              context={personContext(callState.user.id)}
              onOffer={offerRide}
              onRespondOffer={respondRide}
              onAccept={handleAcceptCall}
              onMuteToggle={(m) => callState.live && callClient.setMuted(m)}
              onDecline={declineCall}
              onEnd={endCall}
            />
          )}

          {overlayPanel === 'settings' && <SettingsScreen onClose={() => setOverlayPanel(null)} />}
          {overlayPanel === 'complaint' && <ComplaintScreen initial={complaintInitial} onClose={() => { setOverlayPanel(null); setComplaintInitial(null); }} />}
          {overlayPanel === 'profile' && <ProfileScreen mode={mode || 'passenger'} onClose={() => setOverlayPanel(null)} />}
          {overlayPanel === 'privacy' && <PrivacyScreen onClose={() => setOverlayPanel(null)} />}
          {overlayPanel === 'myTrips' && (
            <MyTripsScreen onClose={() => setOverlayPanel(null)}
              onChanged={(open) => setHasCreatedTrip(open > 0 || !!activeRouteRef.current)} />
          )}
        </Suspense>
      </ErrorBoundary>

      {summary && (
        <TripSummary distanceKm={summary.distanceKm} durationMin={summary.durationMin} partner={summary.partner}
          onRate={(stars, tags) => summary.partner && rateCompanion(summary.partner, stars, tags, summary.tripId)}
          onAddContact={summary.partner && !USE_MOCKS && isRealUserId(summary.partner.id) && !contactIds.includes(idOf(summary.partner.id))
            ? () => saveContact({ id: summary.partner!.id, name: summary.partner!.name }) : undefined}
          onAgain={() => { setSummary(null); setCreateInitial(summary.route || lastRouteRef.current); if (screen === 'map') openRouteSheet(); }}
          onDone={() => setSummary(null)} />
      )}

      <ConfirmHost />

      {sessionLost && <AuthErrorScreen variant="session" onRetry={() => window.location.reload()} />}
    </div>
  );
}
