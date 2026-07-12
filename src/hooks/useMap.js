/* ════════════════════════════════════════════════════════════════
   useMap — imperative Leaflet controller hook.
   Owns the map instance and all layer groups (routes, markers, walkers,
   user route, previews). Exposes a flat command API the App orchestrates.
   Decoupled from data: it only renders what it's handed.
   ════════════════════════════════════════════════════════════════ */

import { useRef, useEffect, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet-ant-path';
import 'leaflet-rotate'; // patches L.Map with bearing/rotation + two-finger touchRotate
import { T } from '@/constants/theme';
import { TASHKENT, MAP_STYLES, themeFor } from '@/constants/map';
import {
  makeMarkerIcon, makeUserDot, makeMatchedIcon, makeAntPath,
  makeWalkerIcon, makeStartIcon, makeDestIcon, makeMeIcon,
} from '@/utils/leafletIcons';

export function useMap(containerRef, active) {
  const mapRef = useRef(null);
  const tileRef = useRef(null);
  const rendererRef = useRef(null);
  const zoomingRef = useRef(false);
  const layersRef = useRef({ routes: [], markers: L.layerGroup(), matched: L.layerGroup(), walkers: L.layerGroup(), userRoute: L.layerGroup(), preview: L.layerGroup() });
  const walkerLayersRef = useRef(new Map());
  const walkerBadgeRef = useRef({});
  const userMarkerRef = useRef(null);
  const userCircleRef = useRef(null);
  const bearingRafRef = useRef(null);   // rAF id for the eased bearing animation
  const bearingTargetRef = useRef(0);   // heading the rotation is easing toward

  useEffect(() => {
    if (!active || !containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: TASHKENT, zoom: 14,
      zoomControl: false, attributionControl: false,
      renderer: (rendererRef.current = L.svg({ padding: 2 })),
      // Rotation: two-finger gesture rotates the map; compass/follow mode drives
      // the bearing programmatically via setBearing. rotateControl off (custom UI).
      rotate: true, touchRotate: true, bearing: 0, rotateControl: false,
    });
    tileRef.current = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(map);
    layersRef.current.walkers.addTo(map);
    layersRef.current.userRoute.addTo(map);
    layersRef.current.preview.addTo(map);
    layersRef.current.markers.addTo(map);
    layersRef.current.matched.addTo(map);
    mapRef.current = map;
    map.on('zoomstart', () => { zoomingRef.current = true; });
    map.on('zoomend', () => { zoomingRef.current = false; });
    return () => {
      if (bearingRafRef.current) { cancelAnimationFrame(bearingRafRef.current); bearingRafRef.current = null; }
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

  // Smoothly keep the current zoom and re-center on a point (used by follow mode).
  const recenter = useCallback((latlng) => {
    if (latlng) mapRef.current?.panTo(latlng, { animate: true, duration: 0.5 });
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
      if (Math.abs(d) < 0.4) { map.setBearing(bearingTargetRef.current); bearingRafRef.current = null; return; }
      map.setBearing(cur + d * 0.22); // ease 22% of the remaining angle each frame
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
    if (!mapRef.current) return;
    layersRef.current.routes.forEach((l) => mapRef.current.removeLayer(l));
    layersRef.current.routes = [];
    routes.forEach((rt, i) => {
      const coords = rt.geometry.coordinates.map((c) => [c[1], c[0]]);
      const line = L.polyline(coords, {
        color: i === primaryIdx ? T.teal : 'rgba(255,255,255,0.3)',
        weight: i === primaryIdx ? 5 : 3,
        opacity: 1,
        dashArray: i === primaryIdx ? null : '8 6',
      }).addTo(mapRef.current);
      layersRef.current.routes.push(line);
    });
    if (routes.length > 0) {
      const coords = routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);
      mapRef.current.fitBounds(L.latLngBounds(coords), { padding: [60, 60] });
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

  const showMatchedUsers = useCallback((users, onSelect) => {
    if (!mapRef.current) return;
    layersRef.current.matched.clearLayers();
    users.forEach((u) => {
      const color = u.type === 'driver' ? T.amber : T.purple;
      const icon = makeMatchedIcon(color, u.initials);
      L.marker(u.latlng, { icon }).addTo(layersRef.current.matched).on('click', () => onSelect(u));
    });
  }, []);

  const clearMatched = useCallback(() => {
    layersRef.current.matched.clearLayers();
  }, []);

  const setUserLocation = useCallback((latlng, heading) => {
    const map = mapRef.current; if (!map || !latlng) return;
    if (userCircleRef.current) userCircleRef.current.setLatLng(latlng);
    else userCircleRef.current = L.circle(latlng, {
      radius: 35, color: T.teal, weight: 1.5, opacity: 0.5,
      fillColor: T.teal, fillOpacity: 0.12,
    }).addTo(map);
    if (userMarkerRef.current) userMarkerRef.current.setLatLng(latlng);
    else userMarkerRef.current = L.marker(latlng, { icon: makeMeIcon(), zIndexOffset: 1500 }).addTo(map);
    if (heading != null && userMarkerRef.current._icon) {
      const arrow = userMarkerRef.current._icon.querySelector('.me-arrow');
      if (arrow) arrow.style.transform = 'rotate(' + heading + 'deg)';
    }
  }, []);

  const applyWalkerBadges = useCallback(() => {
    const lm = walkerLayersRef.current; if (!lm) return;
    const counts = walkerBadgeRef.current || {};
    lm.forEach((layer, id) => {
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
    const map = mapRef.current; if (!map) return;
    layersRef.current.walkers.clearLayers();
    const lm = new Map();
    const theme = themeFor(mode);
    const grp = layersRef.current.walkers;
    walkers.forEach((w) => {
      const remaining = (w._remaining && w._remaining.length > 1) ? w._remaining : w.route;
      const traveled = w._traveled || [];
      const ant = makeAntPath(remaining, {
        delay: 10400, dashArray: [10, 22], weight: 5,
        color: w.color, pulseColor: theme.pulse, opacity: 0.95, lineCap: 'round',
        renderer: rendererRef.current,
      });
      ant.addTo(grp);
      const trav = L.polyline(traveled, { color: theme.traveled, weight: 5, opacity: 0.9, lineCap: 'round' }).addTo(grp);
      const startMk = L.marker(w.route[0], { icon: makeStartIcon(w.color, theme) }).addTo(grp);
      const destMk = L.marker(w.route[w.route.length - 1], { icon: makeDestIcon(w.color, theme) }).addTo(grp);
      const mk = L.marker(w.position || w.route[0], { icon: makeWalkerIcon(w.color, w.initials), zIndexOffset: 600 }).addTo(grp);
      mk.on('click', () => onSelect && onSelect(w.id));
      lm.set(w.id, { ant, trav, mk, start: startMk, dest: destMk });
    });
    walkerLayersRef.current = lm;
    applyWalkerBadges();
  }, [applyWalkerBadges]);

  const setWalkerBadges = useCallback((map) => {
    walkerBadgeRef.current = map || {};
    applyWalkerBadges();
  }, [applyWalkerBadges]);

  const tickWalkers = useCallback((walkers) => {
    const lm = walkerLayersRef.current; if (!lm) return;
    if (zoomingRef.current) return;
    walkers.forEach((w) => {
      const layer = lm.get(w.id); if (!layer) return;
      if (w._remaining && w._remaining.length > 1 && layer.ant.setLatLngs) layer.ant.setLatLngs(w._remaining);
      if (w._traveled && layer.trav.setLatLngs) layer.trav.setLatLngs(w._traveled);
      if (w.position) layer.mk.setLatLng(w.position);
    });
    applyWalkerBadges();
  }, [applyWalkerBadges]);

  // ── Live presence walkers (marker-only; no precomputed route) ──
  // Reuses the same walkers group + walkerLayersRef so badges/highlight/dim
  // keep working. Incremental: upsert on WalkerMoved, remove on WalkerGone.
  const upsertWalkerMarker = useCallback((w, onSelect) => {
    const map = mapRef.current; if (!map) return;
    const pos = w.position || (w.route && w.route[0]); if (!pos) return;
    const lm = walkerLayersRef.current;
    const layer = lm.get(w.id);
    if (layer && layer.mk) {
      layer.mk.setLatLng(pos);
    } else {
      const mk = L.marker(pos, { icon: makeWalkerIcon(w.color, w.initials), zIndexOffset: 600 })
        .addTo(layersRef.current.walkers);
      mk.on('click', () => onSelect && onSelect(w.id));
      lm.set(w.id, { ...(layer || {}), mk }); // preserve a route drawn before the marker
    }
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
    const map = mapRef.current; if (!map || !coords || coords.length < 2) return;
    const lm = walkerLayersRef.current;
    const layer = lm.get(id) || {};
    const grp = layersRef.current.walkers;
    const theme = themeFor('dark');
    const c = color || T.teal;
    ['ant', 'start', 'dest'].forEach((k) => { if (layer[k]) grp.removeLayer(layer[k]); });
    const ant = makeAntPath(coords, {
      delay: 10400, dashArray: [10, 22], weight: 5,
      color: c, pulseColor: theme.pulse, opacity: 0.95, lineCap: 'round',
      renderer: rendererRef.current,
    });
    ant.addTo(grp);
    const start = L.marker(coords[0], { icon: makeStartIcon(c, theme) }).addTo(grp);
    const dest = L.marker(coords[coords.length - 1], { icon: makeDestIcon(c, theme) }).addTo(grp);
    lm.set(id, { ...layer, ant, start, dest });
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
    const layer = walkerLayersRef.current.get(id); if (!layer) return;
    if (layer.mk && layer.mk.setOpacity) layer.mk.setOpacity(offline ? 0.35 : 1);
    if (layer.ant && layer.ant.setStyle) layer.ant.setStyle({ opacity: offline ? 0.25 : 0.95 });
    if (layer.trav && layer.trav.setStyle) layer.trav.setStyle({ opacity: offline ? 0.2 : 0.9 });
    if (layer.start && layer.start.setOpacity) layer.start.setOpacity(offline ? 0.35 : 1);
    if (layer.dest && layer.dest.setOpacity) layer.dest.setOpacity(offline ? 0.35 : 1);
  }, []);

  const clearWalkers = useCallback(() => {
    layersRef.current.walkers.clearLayers();
    walkerLayersRef.current = new Map();
    if (mapRef.current) {
      if (userMarkerRef.current) { mapRef.current.removeLayer(userMarkerRef.current); userMarkerRef.current = null; }
      if (userCircleRef.current) { mapRef.current.removeLayer(userCircleRef.current); userCircleRef.current = null; }
    }
  }, []);

  const fitWalkers = useCallback((userLoc, walkers) => {
    const map = mapRef.current; if (!map) return;
    const pts = [];
    if (userLoc) pts.push(userLoc);
    walkers.forEach((w) => { pts.push(w.route[0]); });
    if (pts.length > 0) map.fitBounds(L.latLngBounds(pts), { padding: [72, 72], maxZoom: 15 });
  }, []);

  const setWalkersDimmed = useCallback((dim) => {
    const lm = walkerLayersRef.current; if (!lm) return;
    lm.forEach((layer) => {
      if (layer.ant && layer.ant.setStyle) layer.ant.setStyle({ opacity: dim ? 0.15 : 0.95 });
      if (layer.trav && layer.trav.setStyle) layer.trav.setStyle({ opacity: dim ? 0.1 : 0.9 });
      if (layer.mk && layer.mk.setOpacity) layer.mk.setOpacity(dim ? 0.28 : 1);
      if (layer.start && layer.start.setOpacity) layer.start.setOpacity(dim ? 0.28 : 1);
      if (layer.dest && layer.dest.setOpacity) layer.dest.setOpacity(dim ? 0.28 : 1);
    });
  }, []);

  const highlightWalker = useCallback((id) => {
    const lm = walkerLayersRef.current; if (!lm) return;
    const has = id != null && lm.has(id);
    lm.forEach((layer, wid) => {
      const on = !has || wid === id;
      if (layer.ant && layer.ant.setStyle) layer.ant.setStyle({ opacity: on ? 0.95 : 0.12 });
      if (layer.trav && layer.trav.setStyle) layer.trav.setStyle({ opacity: on ? 0.9 : 0.08 });
      if (layer.mk && layer.mk.setOpacity) layer.mk.setOpacity(on ? 1 : 0.3);
      if (layer.start && layer.start.setOpacity) layer.start.setOpacity(on ? 1 : 0.25);
      if (layer.dest && layer.dest.setOpacity) layer.dest.setOpacity(on ? 1 : 0.25);
    });
    if (has) {
      const layer = lm.get(id);
      if (layer.trav && layer.trav.bringToFront) layer.trav.bringToFront();
      if (layer.ant && layer.ant.bringToFront) layer.ant.bringToFront();
      if (layer.mk && layer.mk.setZIndexOffset) layer.mk.setZIndexOffset(1200);
    }
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
  const userRouteRef = useRef({ trav: null, rem: null });
  const renderUserRoute = useCallback((coords, mode) => {
    const map = mapRef.current; if (!map || !coords || coords.length < 2) return;
    layersRef.current.userRoute.clearLayers();
    const theme = themeFor(mode);
    const glow = L.polyline(coords, {
      color: T.teal, weight: 17, opacity: 0.20, lineCap: 'round', lineJoin: 'round',
      className: 'owner-route-glow', interactive: false,
    }).addTo(layersRef.current.userRoute);
    const rem = L.polyline(coords, {
      color: T.teal, weight: 9, opacity: 1, lineCap: 'round', lineJoin: 'round',
      className: 'owner-route-main',
    }).addTo(layersRef.current.userRoute);
    const trav = L.polyline([], {
      color: theme.traveled, weight: 9, opacity: 0.95, lineCap: 'round', lineJoin: 'round',
    }).addTo(layersRef.current.userRoute);
    userRouteRef.current = { trav, rem, glow };
  }, []);
  const updateUserRoute = useCallback((traveled, remaining) => {
    const r = userRouteRef.current; if (!r) return;
    if (zoomingRef.current) return;
    if (r.trav && traveled) r.trav.setLatLngs(traveled);
    if (r.rem && remaining) r.rem.setLatLngs(remaining);
    if (r.glow && remaining) r.glow.setLatLngs(remaining);
  }, []);
  const recolorUserRoute = useCallback((mode) => {
    const r = userRouteRef.current; if (!r || !r.trav) return;
    const theme = themeFor(mode);
    if (r.trav.setStyle) r.trav.setStyle({ color: theme.traveled });
  }, []);
  const clearUserRoute = useCallback(() => {
    layersRef.current.userRoute.clearLayers();
    userRouteRef.current = { trav: null, rem: null, glow: null };
  }, []);

  // ── Walker route preview (server-provided ready route) ──
  const showPreviewRoute = useCallback((coords) => {
    const map = mapRef.current; if (!map || !coords || coords.length < 2) return;
    layersRef.current.preview.clearLayers();
    const grp = layersRef.current.preview;
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
    const lm = walkerLayersRef.current; if (!lm) return;
    lm.forEach((layer) => {
      if (layer.ant && layer.ant.setStyle) layer.ant.setStyle({ opacity: hide ? 0 : 0.95 });
      if (layer.trav && layer.trav.setStyle) layer.trav.setStyle({ opacity: hide ? 0 : 0.9 });
      if (layer.mk && layer.mk.setOpacity) layer.mk.setOpacity(hide ? 0 : 1);
      if (layer.start && layer.start.setOpacity) layer.start.setOpacity(hide ? 0 : 1);
      if (layer.dest && layer.dest.setOpacity) layer.dest.setOpacity(hide ? 0 : 1);
    });
  }, []);
  const showContactFocus = useCallback((contact) => {
    const map = mapRef.current; if (!map) return;
    layersRef.current.preview.clearLayers();
    const grp = layersRef.current.preview;
    const theme = themeFor('dark');
    const color = contact.color || (contact.type === 'driver' ? T.amber : T.purple);
    if (contact.route && contact.route.length > 1) {
      const ant = makeAntPath(contact.route, {
        delay: 10400, dashArray: [10, 22], weight: 5,
        color, pulseColor: theme.pulse, opacity: 0.95, lineCap: 'round',
        renderer: rendererRef.current,
      });
      ant.addTo(grp);
      L.marker(contact.route[0], { icon: makeStartIcon(color, theme) }).addTo(grp);
      L.marker(contact.route[contact.route.length - 1], { icon: makeDestIcon(color, theme) }).addTo(grp);
    }
    if (contact.latlng) {
      L.marker(contact.latlng, { icon: makeWalkerIcon(color, contact.initials), zIndexOffset: 800 }).addTo(grp);
    }
  }, []);
  const fitPoints = useCallback((pts) => {
    const map = mapRef.current; if (!map || !pts || !pts.length) return;
    map.fitBounds(L.latLngBounds(pts), { padding: [96, 110], maxZoom: 15 });
  }, []);

  // tap-to-pick
  const tapPickRef = useRef(null);
  const enableTapPick = useCallback((onPick) => {
    if (!mapRef.current) return;
    mapRef.current.getContainer().style.cursor = 'crosshair';
    const handler = (e) => {
      onPick([e.latlng.lat, e.latlng.lng]);
      mapRef.current.getContainer().style.cursor = '';
      mapRef.current.off('click', handler);
      tapPickRef.current = null;
    };
    tapPickRef.current = handler;
    mapRef.current.on('click', handler);
  }, []);
  const disableTapPick = useCallback(() => {
    if (!mapRef.current || !tapPickRef.current) return;
    mapRef.current.off('click', tapPickRef.current);
    mapRef.current.getContainer().style.cursor = '';
    tapPickRef.current = null;
  }, []);

  // driver tracking simulation
  const trackingRef = useRef(null);
  const startTracking = useCallback((startLatlng, endLatlng, onUpdate) => {
    if (trackingRef.current) clearInterval(trackingRef.current);
    let tk = 0;
    const steps = 60;
    const icon = makeMatchedIcon(T.amber, 'AK');
    const marker = L.marker(startLatlng, { icon }).addTo(mapRef.current);
    trackingRef.current = setInterval(() => {
      tk++;
      const frac = tk / steps;
      const lat = startLatlng[0] + (endLatlng[0] - startLatlng[0]) * frac;
      const lng = startLatlng[1] + (endLatlng[1] - startLatlng[1]) * frac;
      marker.setLatLng([lat, lng]);
      onUpdate && onUpdate(frac);
      if (tk >= steps) { clearInterval(trackingRef.current); trackingRef.current = null; }
    }, 400);
    return () => { clearInterval(trackingRef.current); marker.remove(); };
  }, []);

  return {
    mapRef, flyTo, recenter, setBearing, rotateTo, navFollow, onUserDrag, setRouteLines, setWaypointMarkers, showMatchedUsers, clearMatched,
    enableTapPick, disableTapPick, startTracking, setMapStyle, setUserLocation, renderWalkers,
    tickWalkers, clearWalkers, fitWalkers, setWalkersDimmed, highlightWalker, setWalkerBadges,
    upsertWalkerMarker, removeWalkerMarker, setWalkerRoute, removeWalkerRoute, setWalkerOffline,
    getCenter, onMove, onMoveEnd, renderUserRoute, updateUserRoute, clearUserRoute, recolorUserRoute,
    showPreviewRoute, clearPreviewRoute, fitRoute, clearPlanning, hideWalkers, showContactFocus, fitPoints,
  };
}
