/* ════════════════════════════════════════════════════════════════
   App — top-level screen orchestrator + map/simulation controller.
   Holds screen routing (loading → home → map), owns the map hook, and
   drives the walker simulation, routing, calls, chat and push toasts.
   All data flows through services/hooks; no mock import lives here.
   ════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useCallback } from 'react';
import { T } from '@/constants/theme';
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

import { LoadingScreen } from '@/pages/LoadingScreen';
import { HomeScreen } from '@/pages/HomeScreen';
import { MapUI } from '@/features/matching/MapUI';
import { UserPopup } from '@/features/matching/UserPopup';
import { WalkerPreviewCard } from '@/features/matching/WalkerPreviewCard';
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

export function App() {
  const [screen, setScreen] = useState('loading');
  const [mode, setMode] = useState(null);
  const [showSheet, setShowSheet] = useState(false);
  const [showMatching, setShowMatching] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [callState, setCallState] = useState(null);
  const [chatUser, setChatUser] = useState(null);
  const [pushNotif, setPushNotif] = useState(null);
  const [mapStyle, setMapStyle] = useState('dark');
  const [matchCount, setMatchCount] = useState(0);
  const [, setRoutePicking] = useState(false);
  const [activeRoute, setActiveRoute] = useState(null);
  const [navProgress, setNavProgress] = useState(0);
  const [navTask, setNavTask] = useState(null); // {type:'pick'|'preview', ...}
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [overlayPanel, setOverlayPanel] = useState(null); // 'settings' | 'complaint' | 'privacy'
  const mapContainerRef = useRef(null);

  const userLocRef = useRef(null);
  const simRef = useRef(null);
  const simWalkersRef = useRef([]);
  const mapStyleRef = useRef('dark');
  const navTimerRef = useRef(null);
  const navProgRef = useRef(0);
  const activeRouteRef = useRef(null);
  const contactsRef = useRef([]);

  const mapHook = useMap(mapContainerRef, screen === 'map');

  // Contacts loaded once via the service (used by the push-message simulation).
  useEffect(() => { listContacts().then((c) => { contactsRef.current = c; }); }, []);

  useEffect(() => { mapHook.setMapStyle && mapHook.setMapStyle(mapStyle); }, [mapStyle, screen]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatForPopup = useCallback((w) => {
    const userLoc = userLocRef.current || Sim.TASHKENT || TASHKENT;
    const km = Sim ? Sim.haversine(userLoc, w.position) : 0;
    const etaMin = Math.max(1, Math.round(km / 0.4));
    return {
      id: w.id, type: w.type, initials: w.initials, name: w.name, color: w.color,
      sub: w.type === 'driver' ? `${w.vehicle} · ${w.seats} ${t('common.seats')}` : t('userPopup.sub'),
      dist: km.toFixed(1) + ' km', eta: etaMin + ' min',
      rating: (typeof w.rating === 'number' ? w.rating.toFixed(1) : w.rating),
      trips: w.trips, latlng: w.position,
    };
  }, []);

  const openWalker = useCallback((id) => {
    const w = simWalkersRef.current.find((x) => x.id === id);
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
    const userLoc = userLocRef.current || Sim.randomUserLocation();
    userLocRef.current = userLoc;
    mapHook.setUserLocation(userLoc);
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
    if (screen === 'map' && mode) buildSim();
    return () => { if (simRef.current) { simRef.current.stop(); simRef.current = null; } };
  }, [screen, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const h = () => { if (screen === 'map' && mode) buildSim(); };
    window.addEventListener('ontheway:simcount', h);
    return () => window.removeEventListener('ontheway:simcount', h);
  }, [screen, mode, buildSim]);

  useEffect(() => {
    mapStyleRef.current = mapStyle;
    if (simRef.current && screen === 'map') {
      mapHook.renderWalkers(simWalkersRef.current, mapStyle, openWalker);
    }
    mapHook.recolorUserRoute && mapHook.recolorUserRoute(mapStyle);
  }, [mapStyle]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleRouteSelected = async (route) => {
    setShowSheet(false);
    setRoutePicking(false);
    if (!Sim || !route || !route.geometry) return;
    const coords = route.geometry.coordinates.map((c) => [c[1], c[0]]);
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

    mapHook.setRouteLines([]);
    mapHook.renderUserRoute(coords, mapStyleRef.current);
    mapHook.fitRoute(coords);
    startUserNav(route, coords);
  };

  const startUserNav = (route, coords) => {
    if (navTimerRef.current) { clearInterval(navTimerRef.current); navTimerRef.current = null; }
    navProgRef.current = 0;
    setNavProgress(0);
    const distanceKm = route.distance / 1000;
    const durationMin = route.duration / 60;
    const ar = { coords, distanceKm, durationMin };
    activeRouteRef.current = ar;
    setActiveRoute(ar);
    const intervalMs = 500;
    const demoMs = Math.min(360000, Math.max(150000, distanceKm * 150000));
    const stepInc = intervalMs / demoMs;
    navTimerRef.current = setInterval(() => {
      navProgRef.current = Math.min(1, navProgRef.current + stepInc);
      const p = navProgRef.current;
      const s = Sim.splitRoute(coords, p);
      mapHook.updateUserRoute(s.traveled, s.remaining);
      let heading = null;
      if (s.remaining && s.remaining.length >= 2) heading = Sim.bearing(s.remaining[0], s.remaining[1]);
      else if (s.traveled && s.traveled.length >= 2) heading = Sim.bearing(s.traveled[s.traveled.length - 2], s.traveled[s.traveled.length - 1]);
      if (s.position) mapHook.setUserLocation(s.position, heading);
      setNavProgress(p);
      if (p >= 1) { clearInterval(navTimerRef.current); navTimerRef.current = null; }
    }, intervalMs);
  };

  const endRoute = () => {
    if (navTimerRef.current) { clearInterval(navTimerRef.current); navTimerRef.current = null; }
    mapHook.clearUserRoute();
    mapHook.clearPlanning();
    activeRouteRef.current = null;
    navProgRef.current = 0;
    setActiveRoute(null);
    setNavProgress(0);
    if (userLocRef.current) mapHook.setUserLocation(userLocRef.current);
  };

  const handleCall = (user) => {
    setSelectedUser(null);
    setCallState({ user, phase: 'ringing' });
  };

  const walkerToCallUser = (w) => ({
    id: w.id, type: w.type, initials: w.initials, name: w.name,
    sub: w.type === 'driver' ? `${w.vehicle} · ${w.seats} ${t('common.seats')}` : t('common.passenger'),
    rating: w.rating, latlng: w.fromLatlng,
  });
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
    if (screen !== 'map' || !mode) return;
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
    setCallState((c) => ({ ...c, phase: 'active' }));
    const userLoc = userLocRef.current || TASHKENT;
    const from = (callState && callState.user && callState.user.latlng) || [41.310, 69.255];
    const stop = mapHook.startTracking(from, userLoc, () => { /* ETA */ });
    return stop;
  };

  const exitToHome = () => {
    setScreen('home'); setShowMatching(false); setShowSheet(false); setRoutePicking(false);
    if (navTimerRef.current) { clearInterval(navTimerRef.current); navTimerRef.current = null; }
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

      {screen === 'loading' && <LoadingScreen onDone={() => setScreen('home')} />}

      {screen === 'home' && (
        <HomeScreen onSelect={(m) => { setMode(m); setScreen('map'); }} />
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
            mapStyle={mapStyle}
            onMapStyleChange={setMapStyle}
          />
          <SideDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            mode={mode}
            onModeChange={(m) => { if (m !== mode) setMode(m); }}
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
            />
          )}
        </>
      )}

      {callState && (
        <CallScreen
          callee={callState.user}
          phase={callState.phase}
          onAccept={handleAcceptCall}
          onAgree={handleAgreeRide}
          onDecline={() => setCallState(null)}
          onEnd={() => setCallState(null)}
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
