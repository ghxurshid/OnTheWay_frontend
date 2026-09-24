// @ts-nocheck — imperative Leaflet boundary.
// Leaflet 1.9 ships no types and is augmented at runtime by leaflet-ant-path
// and leaflet-rotate (setBearing/rotateTo/makeAntPath …), so every map object
// here is effectively `any`. Type-checking this file would only add ~60 `any`
// annotations with zero safety gain; the typed seam is the facade it returns,
// consumed by the (checked) hooks and components. Kept as .ts for a uniform
// module graph; the surrounding app is fully type-checked.
/* ════════════════════════════════════════════════════════════════
   useMap — imperative Leaflet controller hook.
   Owns the map instance and all layer groups (routes, markers, walkers,
   user route, previews). Exposes a flat command API the App orchestrates.
   ════════════════════════════════════════════════════════════════ */

import { useRef, useEffect, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet-ant-path';
import 'leaflet-rotate'; // patches L.Map with bearing/rotation + two-finger touchRotate
import { T, partyColor } from '@/constants/theme';
import { TASHKENT, MAP_STYLES, themeFor } from '@/constants/map';
import {
  makeMarkerIcon, makeUserDot, makeMatchedIcon, makeAntPath,
  makeWalkerIcon, makeStartIcon, makeDestIcon, makeMeIcon,
} from '@/utils/leafletIcons';
import { createHeadingSync, createVectorGestureSync } from '@/utils/mapRenderSync';
import { osrmToLatLngs } from '@/utils/geo';

// Opacity presets for the parts of a walker's layer entry: the animated route
// (ant), its traveled part (trav), the marker, and the start/destination pins.
const VISIBLE = { ant: 0.95, trav: 0.9, marker: 1, pins: 1 };
const DIMMED = { ant: 0.15, trav: 0.1, marker: 0.28, pins: 0.28 };
const FADED = { ant: 0.12, trav: 0.08, marker: 0.3, pins: 0.25 };
const OFFLINE = { ant: 0.25, trav: 0.2, marker: 0.35, pins: 0.35 };
const HIDDEN = { ant: 0, trav: 0, marker: 0, pins: 0 };

function setWalkerOpacity(layer, o) {
  if (layer.ant && layer.ant.setStyle) layer.ant.setStyle({ opacity: o.ant });
  if (layer.trav && layer.trav.setStyle) layer.trav.setStyle({ opacity: o.trav });
  if (layer.mk && layer.mk.setOpacity) layer.mk.setOpacity(o.marker);
  if (layer.start && layer.start.setOpacity) layer.start.setOpacity(o.pins);
  if (layer.dest && layer.dest.setOpacity) layer.dest.setOpacity(o.pins);
}

// The animated "crawling" route every walker/contact route is drawn with.
const walkerAntPath = (coords, color, theme, renderer) => makeAntPath(coords, {
  delay: 10400, dashArray: [10, 22], weight: 5,
  color, pulseColor: theme.pulse, opacity: 0.95, lineCap: 'round', renderer,
});

// Start dot + destination pin at the two ends of a route.
const addRoutePins = (group, coords, color, theme) => ({
  start: L.marker(coords[0], { icon: makeStartIcon(color, theme) }).addTo(group),
  dest: L.marker(coords[coords.length - 1], { icon: makeDestIcon(color, theme) }).addTo(group),
});

const walkerMarker = (pos, w, onSelect) => {
  const mk = L.marker(pos, { icon: makeWalkerIcon(w.color, w.initials), zIndexOffset: 600 });
  mk.on('click', () => onSelect && onSelect(w.id));
  return mk;
};

export function useMap(containerRef, active) {
  const mapRef = useRef(null);
  const tileRef = useRef(null);
  const rendererRef = useRef(null);
  const gestureRef = useRef(null);      // vector↔pinch sync (owns the gesture flag)
  const headingSyncRef = useRef(null);  // "me" arrow ↔ map bearing sync
  const flushRef = useRef(null);        // deferred geometry flush (set below)
  const pendingRef = useRef({ userRoute: null, walkers: null });
  // True only between zoomstart and zoomend. Geometry written in that window
  // would be projected against the live zoom while the container still carries
  // the frozen-baseline transform, so it is queued and flushed on settle.
  const isGesturing = () => !!gestureRef.current && gestureRef.current.isGesturing();
  const layersRef = useRef({ routes: [], markers: L.layerGroup(), walkers: L.layerGroup(), userRoute: L.layerGroup(), preview: L.layerGroup() });
  const walkerLayersRef = useRef(new Map());
  const walkerBadgeRef = useRef({});
  const userMarkerRef = useRef(null);
  const userCircleRef = useRef(null);
  const bearingRafRef = useRef(null);   // rAF id for the eased bearing animation
  const bearingTargetRef = useRef(0);   // heading the rotation is easing toward

  useEffect(() => {
    if (!active || !containerRef.current || mapRef.current) return;

    // The vector renderer must be patched BEFORE it reaches the map: Leaflet
    // resolves a layer's getEvents() handlers once, when the layer is added, so
    // a later patch would never be reached by the rotate/moveend handlers.
    const renderer = (rendererRef.current = L.svg({ padding: 2 }));
    gestureRef.current = createVectorGestureSync(renderer);

    const map = L.map(containerRef.current, {
      center: TASHKENT, zoom: 14,
      zoomControl: false, attributionControl: false,
      renderer,
      // Rotation: two-finger gesture rotates the map; compass/follow mode drives
      // the bearing programmatically via setBearing. rotateControl off (custom UI).
      rotate: true, touchRotate: true, bearing: 0, rotateControl: false,
    });

    // Wire the two frame-accurate syncs before any layer joins the map, so the
    // gesture window is already open when the layers' own handlers run.
    gestureRef.current.attach(map, () => { if (flushRef.current) flushRef.current(); });
    headingSyncRef.current = createHeadingSync(map, () => userMarkerRef.current);

    tileRef.current = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(map);
    const { walkers, userRoute, preview, markers } = layersRef.current;
    [walkers, userRoute, preview, markers].forEach((group) => group.addTo(map));
    mapRef.current = map;

    return () => {
      if (bearingRafRef.current) { cancelAnimationFrame(bearingRafRef.current); bearingRafRef.current = null; }
      if (headingSyncRef.current) { headingSyncRef.current.dispose(); headingSyncRef.current = null; }
      if (gestureRef.current) { gestureRef.current.dispose(); gestureRef.current = null; }
      pendingRef.current = { userRoute: null, walkers: null };
      map.remove(); mapRef.current = null; tileRef.current = null; userMarkerRef.current = null; userCircleRef.current = null;
    };
  }, [active, containerRef]);

  const setMapStyle = useCallback((styleId) => {
    const map = mapRef.current; if (!map) return;
    const style = MAP_STYLES.find((s) => s.id === styleId);
    if (!style) return;
    if (tileRef.current) map.removeLayer(tileRef.current);
    const opts = { maxZoom: 19 };
    if (style.subdomains) opts.subdomains = style.subdomains;
    tileRef.current = L.tileLayer(style.url, opts).addTo(map);
    tileRef.current.bringToBack();
  }, []);

  const flyTo = useCallback((latlng, zoom = 16) => {
    mapRef.current?.flyTo(latlng, zoom, { duration: 0.8 });
  }, []);

  // ── Map bearing (compass / heading-up rotation) ──
  // `rotateTo` eases toward the target over rAF frames so even noisy heading
  // input turns into a smooth rotation instead of a per-event snap ("drebezg").
  // `setBearing` is the instant variant (used to straighten north-up on exit).
  const rotateTo = useCallback((deg) => {
    const m = mapRef.current;
    if (!m || typeof m.setBearing !== 'function' || deg == null || Number.isNaN(deg)) return;
    bearingTargetRef.current = ((deg % 360) + 360) % 360;
    if (bearingRafRef.current) return; // a frame loop is already chasing the target
    const step = () => {
      const map = mapRef.current;
      if (!map) { bearingRafRef.current = null; return; }
      const cur = map.getBearing();
      const d = ((bearingTargetRef.current - cur + 540) % 360) - 180; // shortest path
      if (Math.abs(d) < 0.3) { map.setBearing(bearingTargetRef.current); bearingRafRef.current = null; return; }
      // Ease a gentle 12% of the remaining angle each frame. Small corrections
      // (a 10-15° heading nudge) glide instead of snapping; larger real turns
      // still settle in well under a second.
      map.setBearing(cur + d * 0.12);
      bearingRafRef.current = requestAnimationFrame(step);
    };
    bearingRafRef.current = requestAnimationFrame(step);
  }, []);
  const setBearing = useCallback((deg) => {
    const m = mapRef.current;
    if (bearingRafRef.current) { cancelAnimationFrame(bearingRafRef.current); bearingRafRef.current = null; }
    if (!m || typeof m.setBearing !== 'function' || deg == null || Number.isNaN(deg)) return;
    bearingTargetRef.current = ((deg % 360) + 360) % 360;
    m.setBearing(deg);
  }, []);

  // Follow/navigation recenter: keep the point centered and hold zoom at the
  // requested "balanced" level. Ignores sub-4m GPS jitter (so a parked user
  // doesn't get panned around) and only re-zooms when it changes meaningfully.
  const navFollow = useCallback((latlng, zoom) => {
    const m = mapRef.current; if (!m || !latlng) return;
    const zoomChange = zoom != null && Math.abs(m.getZoom() - zoom) >= 0.5;
    const movedM = m.distance(m.getCenter(), L.latLng(latlng));
    if (!zoomChange && movedM < 4) return; // parked: don't chase GPS micro-noise
    if (zoomChange) m.setView(latlng, zoom, { animate: true, duration: 0.5 });
    else m.panTo(latlng, { animate: true, duration: 0.5 });
  }, []);

  // Fires only on a user-initiated pan/drag (not programmatic moves), so follow
  // mode can release control the moment the user grabs the map.
  const onUserDrag = useCallback((cb) => {
    const m = mapRef.current; if (!m) return () => {};
    m.on('dragstart', cb); return () => m.off('dragstart', cb);
  }, []);

  const setRouteLines = useCallback((routes, primaryIdx = 0) => {
    const map = mapRef.current; if (!map) return;
    layersRef.current.routes.forEach((l) => map.removeLayer(l));
    layersRef.current.routes = routes.map((rt, i) => L.polyline(osrmToLatLngs(rt.geometry.coordinates), {
      color: i === primaryIdx ? T.teal : 'rgba(255,255,255,0.3)',
      weight: i === primaryIdx ? 5 : 3,
      opacity: 1,
      dashArray: i === primaryIdx ? null : '8 6',
    }).addTo(map));
    if (routes.length > 0) {
      map.fitBounds(L.latLngBounds(osrmToLatLngs(routes[0].geometry.coordinates)), { padding: [60, 60] });
    }
  }, []);

  const setWaypointMarkers = useCallback((points) => {
    if (!mapRef.current) return;
    layersRef.current.markers.clearLayers();
    points.forEach((p, i) => {
      if (!p.latlng) return;
      const icon = makeMarkerIcon(i === 0 ? T.teal : T.red, i === 0 ? 'A' : 'B');
      L.marker(p.latlng, { icon }).addTo(layersRef.current.markers);
    });
    L.marker(TASHKENT, { icon: makeUserDot() }).addTo(layersRef.current.markers);
  }, []);

  // `heading` is a GEOGRAPHIC bearing in degrees (null/omitted = keep the last
  // known one). The arrow's screen angle is heading − map bearing and is kept
  // in sync per frame by the heading sync, so a two-finger rotate turns the
  // arrow with the map instead of leaving it pointing at its initial direction.
  // `opts.screenLocked` is the follow/navigation mode: the MAP carries the
  // heading, so the arrow is pinned to screen-up. It is sticky — plain
  // setUserLocation calls (presence, sim setup) never toggle it by accident.
  const setUserLocation = useCallback((latlng, heading, opts) => {
    const map = mapRef.current; if (!map || !latlng) return;
    if (userCircleRef.current) userCircleRef.current.setLatLng(latlng);
    else userCircleRef.current = L.circle(latlng, {
      radius: 35, color: T.teal, weight: 1.5, opacity: 0.5,
      fillColor: T.teal, fillOpacity: 0.12,
    }).addTo(map);
    if (userMarkerRef.current) userMarkerRef.current.setLatLng(latlng);
    else {
      userMarkerRef.current = L.marker(latlng, { icon: makeMeIcon(), zIndexOffset: 1500 }).addTo(map);
      headingSyncRef.current?.refresh(); // fresh icon element → re-bind + repaint
    }
    const sync = headingSyncRef.current; if (!sync) return;
    sync.setScreenLocked(opts ? opts.screenLocked : undefined);
    sync.setHeading(heading);
  }, []);

  const applyWalkerBadges = useCallback(() => {
    const counts = walkerBadgeRef.current || {};
    walkerLayersRef.current.forEach((layer, id) => {
      const iconEl = layer.mk && layer.mk._icon; if (!iconEl) return;
      const n = counts[id] || 0;
      let b = iconEl.querySelector('.msg-badge');
      if (n > 0) {
        if (!b) { b = document.createElement('div'); b.className = 'msg-badge'; iconEl.appendChild(b); }
        b.textContent = n > 9 ? '9+' : String(n);
      } else if (b) { b.remove(); }
    });
  }, []);

  const renderWalkers = useCallback((walkers, mode, onSelect) => {
    if (!mapRef.current) return;
    const grp = layersRef.current.walkers;
    grp.clearLayers();
    pendingRef.current.walkers = null; // fresh set — drop the old queue
    const theme = themeFor(mode);
    const lm = new Map();
    walkers.forEach((w) => {
      const remaining = (w._remaining && w._remaining.length > 1) ? w._remaining : w.route;
      const ant = walkerAntPath(remaining, w.color, theme, rendererRef.current).addTo(grp);
      const trav = L.polyline(w._traveled || [], { color: theme.traveled, weight: 5, opacity: 0.9, lineCap: 'round' }).addTo(grp);
      const pins = addRoutePins(grp, w.route, w.color, theme);
      const mk = walkerMarker(w.position || w.route[0], w, onSelect).addTo(grp);
      lm.set(w.id, { ant, trav, mk, ...pins });
    });
    walkerLayersRef.current = lm;
    applyWalkerBadges();
  }, [applyWalkerBadges]);

  const setWalkerBadges = useCallback((map) => {
    walkerBadgeRef.current = map || {};
    applyWalkerBadges();
  }, [applyWalkerBadges]);

  const applyWalkerTick = useCallback((walkers) => {
    const lm = walkerLayersRef.current;
    walkers.forEach((w) => {
      const layer = lm.get(w.id); if (!layer) return;
      if (w._remaining && w._remaining.length > 1 && layer.ant.setLatLngs) layer.ant.setLatLngs(w._remaining);
      if (w._traveled && layer.trav.setLatLngs) layer.trav.setLatLngs(w._traveled);
      if (w.position) layer.mk.setLatLng(w.position);
    });
    applyWalkerBadges();
  }, [applyWalkerBadges]);

  // Reprojecting geometry mid-pinch would fight the frozen-baseline transform
  // that keeps the vectors scaling with the tiles, so the newest frame is
  // queued and applied the instant the gesture settles (never dropped).
  const tickWalkers = useCallback((walkers) => {
    if (isGesturing()) { pendingRef.current.walkers = walkers; return; }
    applyWalkerTick(walkers);
  }, [applyWalkerTick]);

  // ── Live presence walkers (marker-only; no precomputed route) ──
  // Reuses the same walkers group + walkerLayersRef so badges/highlight/dim
  // keep working. Incremental: upsert on WalkerMoved, remove on WalkerGone.
  const upsertWalkerMarker = useCallback((w, onSelect) => {
    if (!mapRef.current) return;
    const pos = w.position || (w.route && w.route[0]); if (!pos) return;
    const lm = walkerLayersRef.current;
    const layer = lm.get(w.id);
    if (layer && layer.mk) layer.mk.setLatLng(pos);
    // Preserve a route drawn before the marker.
    else lm.set(w.id, { ...(layer || {}), mk: walkerMarker(pos, w, onSelect).addTo(layersRef.current.walkers) });
    applyWalkerBadges();
  }, [applyWalkerBadges]);

  const removeWalkerMarker = useCallback((id) => {
    const lm = walkerLayersRef.current; const layer = lm.get(id); if (!layer) return;
    const grp = layersRef.current.walkers;
    ['ant', 'trav', 'mk', 'start', 'dest'].forEach((k) => layer[k] && grp.removeLayer(layer[k]));
    lm.delete(id);
  }, []);

  // A live walker's shared route (published over presence). Drawn into the same
  // per-walker layer entry as the marker, so removeWalkerMarker / clearWalkers
  // also tear the route down. Keyed by the walker's (string) user id.
  const setWalkerRoute = useCallback((id, coords, color) => {
    if (!mapRef.current || !coords || coords.length < 2) return;
    const lm = walkerLayersRef.current;
    const layer = lm.get(id) || {};
    const grp = layersRef.current.walkers;
    const theme = themeFor('dark');
    const c = color || T.teal;
    ['ant', 'start', 'dest'].forEach((k) => { if (layer[k]) grp.removeLayer(layer[k]); });
    const ant = walkerAntPath(coords, c, theme, rendererRef.current).addTo(grp);
    lm.set(id, { ...layer, ant, ...addRoutePins(grp, coords, c, theme) });
  }, []);

  const removeWalkerRoute = useCallback((id) => {
    const lm = walkerLayersRef.current; const layer = lm.get(id); if (!layer) return;
    const grp = layersRef.current.walkers;
    ['ant', 'start', 'dest'].forEach((k) => { if (layer[k]) { grp.removeLayer(layer[k]); delete layer[k]; } });
    if (layer.mk) lm.set(id, layer); else lm.delete(id);
  }, []);

  // Grey a live walker out while they're offline (grace period): the marker and
  // any shared route stay on the map, just visibly inactive — they come back to
  // full strength if the walker reconnects, and are removed only on WalkerGone.
  const setWalkerOffline = useCallback((id, offline) => {
    const layer = walkerLayersRef.current.get(id);
    if (layer) setWalkerOpacity(layer, offline ? OFFLINE : VISIBLE);
  }, []);

  const clearWalkers = useCallback(() => {
    layersRef.current.walkers.clearLayers();
    walkerLayersRef.current = new Map();
    pendingRef.current.walkers = null; // queued frames belong to the old set
    const map = mapRef.current; if (!map) return;
    if (userMarkerRef.current) { map.removeLayer(userMarkerRef.current); userMarkerRef.current = null; }
    if (userCircleRef.current) { map.removeLayer(userCircleRef.current); userCircleRef.current = null; }
  }, []);

  const fitWalkers = useCallback((userLoc, walkers) => {
    const map = mapRef.current; if (!map) return;
    const pts = [...(userLoc ? [userLoc] : []), ...walkers.map((w) => w.route[0])];
    if (pts.length > 0) map.fitBounds(L.latLngBounds(pts), { padding: [72, 72], maxZoom: 15 });
  }, []);

  const setWalkersDimmed = useCallback((dim) => {
    walkerLayersRef.current.forEach((layer) => setWalkerOpacity(layer, dim ? DIMMED : VISIBLE));
  }, []);

  const highlightWalker = useCallback((id) => {
    const lm = walkerLayersRef.current;
    const has = id != null && lm.has(id);
    lm.forEach((layer, wid) => setWalkerOpacity(layer, !has || wid === id ? VISIBLE : FADED));
    if (!has) return;
    const layer = lm.get(id);
    if (layer.trav && layer.trav.bringToFront) layer.trav.bringToFront();
    if (layer.ant && layer.ant.bringToFront) layer.ant.bringToFront();
    if (layer.mk && layer.mk.setZIndexOffset) layer.mk.setZIndexOffset(1200);
  }, []);

  const getCenter = useCallback(() => {
    const m = mapRef.current; if (!m) return null;
    const c = m.getCenter(); return [c.lat, c.lng];
  }, []);
  const onMove = useCallback((cb) => {
    const m = mapRef.current; if (!m) return () => {};
    m.on('move', cb); return () => m.off('move', cb);
  }, []);
  const onMoveEnd = useCallback((cb) => {
    const m = mapRef.current; if (!m) return () => {};
    m.on('moveend', cb); return () => m.off('moveend', cb);
  }, []);

  // ── App-owner (user) route — SOLID, traveled part de-coloured ──
  const userRouteRef = useRef({ trav: null, rem: null, glow: null });
  const renderUserRoute = useCallback((coords, mode) => {
    if (!mapRef.current || !coords || coords.length < 2) return;
    const grp = layersRef.current.userRoute;
    grp.clearLayers();
    pendingRef.current.userRoute = null; // fresh geometry — drop the old queue
    const line = { lineCap: 'round', lineJoin: 'round' };
    userRouteRef.current = {
      glow: L.polyline(coords, { ...line, color: T.teal, weight: 17, opacity: 0.20, className: 'owner-route-glow', interactive: false }).addTo(grp),
      rem: L.polyline(coords, { ...line, color: T.teal, weight: 9, opacity: 1, className: 'owner-route-main' }).addTo(grp),
      trav: L.polyline([], { ...line, color: themeFor(mode).traveled, weight: 9, opacity: 0.95 }).addTo(grp),
    };
  }, []);
  const applyUserRoute = useCallback((traveled, remaining) => {
    const r = userRouteRef.current;
    if (r.trav && traveled) r.trav.setLatLngs(traveled);
    if (r.rem && remaining) r.rem.setLatLngs(remaining);
    if (r.glow && remaining) r.glow.setLatLngs(remaining);
  }, []);
  const updateUserRoute = useCallback((traveled, remaining) => {
    if (isGesturing()) { pendingRef.current.userRoute = [traveled, remaining]; return; }
    applyUserRoute(traveled, remaining);
  }, [applyUserRoute]);
  const recolorUserRoute = useCallback((mode) => {
    const r = userRouteRef.current;
    if (r.trav && r.trav.setStyle) r.trav.setStyle({ color: themeFor(mode).traveled });
  }, []);
  const clearUserRoute = useCallback(() => {
    layersRef.current.userRoute.clearLayers();
    userRouteRef.current = { trav: null, rem: null, glow: null };
    pendingRef.current.userRoute = null; // don't replay the old route's last frame
  }, []);

  // ── Walker route preview (server-provided ready route) ──
  const showPreviewRoute = useCallback((coords) => {
    const map = mapRef.current; if (!map || !coords || coords.length < 2) return;
    const grp = layersRef.current.preview;
    grp.clearLayers();
    L.polyline(coords, { color: T.teal, weight: 16, opacity: 0.18, lineCap: 'round', className: 'owner-route-glow', interactive: false }).addTo(grp);
    L.polyline(coords, { color: T.teal, weight: 7, opacity: 1, lineCap: 'round', lineJoin: 'round', className: 'owner-route-main' }).addTo(grp);
    L.marker(coords[0], { icon: makeMarkerIcon(T.green, 'A') }).addTo(grp);
    L.marker(coords[coords.length - 1], { icon: makeMarkerIcon(T.red, 'B') }).addTo(grp);
    map.fitBounds(L.latLngBounds(coords), { padding: [80, 110], maxZoom: 15 });
  }, []);
  const clearPreviewRoute = useCallback(() => {
    layersRef.current.preview.clearLayers();
  }, []);
  const clearPlanning = useCallback(() => {
    layersRef.current.markers.clearLayers();
    if (mapRef.current) layersRef.current.routes.forEach((l) => mapRef.current.removeLayer(l));
    layersRef.current.routes = [];
  }, []);
  const fitRoute = useCallback((coords) => {
    const map = mapRef.current; if (!map || !coords || !coords.length) return;
    map.fitBounds(L.latLngBounds(coords), { padding: [70, 96], maxZoom: 15 });
  }, []);

  // ── Contact focus: hide other walkers entirely ──
  const hideWalkers = useCallback((hide) => {
    walkerLayersRef.current.forEach((layer) => setWalkerOpacity(layer, hide ? HIDDEN : VISIBLE));
  }, []);
  const showContactFocus = useCallback((contact) => {
    if (!mapRef.current) return;
    const grp = layersRef.current.preview;
    grp.clearLayers();
    const theme = themeFor('dark');
    const color = contact.color || partyColor(contact.type);
    if (contact.route && contact.route.length > 1) {
      walkerAntPath(contact.route, color, theme, rendererRef.current).addTo(grp);
      addRoutePins(grp, contact.route, color, theme);
    }
    if (contact.latlng) {
      L.marker(contact.latlng, { icon: makeWalkerIcon(color, contact.initials), zIndexOffset: 800 }).addTo(grp);
    }
  }, []);
  const fitPoints = useCallback((pts) => {
    const map = mapRef.current; if (!map || !pts || !pts.length) return;
    map.fitBounds(L.latLngBounds(pts), { padding: [96, 110], maxZoom: 15 });
  }, []);

  // Demo-mode "the driver is coming" animation after a simulated call is accepted.
  const trackingRef = useRef(null);
  const startTracking = useCallback((startLatlng, endLatlng, onUpdate) => {
    if (trackingRef.current) clearInterval(trackingRef.current);
    const steps = 60;
    let tick = 0;
    const marker = L.marker(startLatlng, { icon: makeMatchedIcon(T.amber, 'AK') }).addTo(mapRef.current);
    trackingRef.current = setInterval(() => {
      tick++;
      const frac = tick / steps;
      marker.setLatLng([
        startLatlng[0] + (endLatlng[0] - startLatlng[0]) * frac,
        startLatlng[1] + (endLatlng[1] - startLatlng[1]) * frac,
      ]);
      onUpdate && onUpdate(frac);
      if (tick >= steps) { clearInterval(trackingRef.current); trackingRef.current = null; }
    }, 400);
    return () => { clearInterval(trackingRef.current); marker.remove(); };
  }, []);

  // Drain whatever was queued while the pinch was running. Bound through a ref
  // because the map effect (which owns the gesture binding) is created before
  // these callbacks exist.
  const flushPending = useCallback(() => {
    const p = pendingRef.current;
    if (p.walkers) { const w = p.walkers; p.walkers = null; applyWalkerTick(w); }
    if (p.userRoute) { const [tv, rm] = p.userRoute; p.userRoute = null; applyUserRoute(tv, rm); }
  }, [applyWalkerTick, applyUserRoute]);
  useEffect(() => { flushRef.current = flushPending; }, [flushPending]);

  // Stable API object: every member above is a ref or a useCallback, so the
  // facade never needs to change identity. Memoising it lets consumers (and
  // React.memo'd children that receive `mapHook`) skip re-renders.
  return useMemo(() => ({
    mapRef, flyTo, setBearing, rotateTo, navFollow, onUserDrag, setRouteLines, setWaypointMarkers,
    startTracking, setMapStyle, setUserLocation, renderWalkers,
    tickWalkers, clearWalkers, fitWalkers, setWalkersDimmed, highlightWalker, setWalkerBadges,
    upsertWalkerMarker, removeWalkerMarker, setWalkerRoute, removeWalkerRoute, setWalkerOffline,
    getCenter, onMove, onMoveEnd, renderUserRoute, updateUserRoute, clearUserRoute, recolorUserRoute,
    showPreviewRoute, clearPreviewRoute, fitRoute, clearPlanning, hideWalkers, showContactFocus, fitPoints,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps -- all members are referentially stable
}
