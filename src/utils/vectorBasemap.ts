// @ts-nocheck — imperative Leaflet/MapLibre boundary (both are runtime globals here).
/* ════════════════════════════════════════════════════════════════
   VECTOR BASEMAP — readable street names on a rotated map.
   ────────────────────────────────────────────────────────────────
   Raster tiles have their labels baked into the image, so when
   leaflet-rotate turns the map past 90° every street name turns
   upside down with it. Nothing on the Leaflet side can fix that.

   A vector renderer can: MapLibre GL draws labels itself, every frame,
   and line labels use `text-keep-upright` (the default in OpenMapTiles
   styles) — past 90° a street name flips 180° so it always reads
   left-to-right, the same behaviour as Yandex Navigator.

   So the basemap is drawn by a non-interactive MapLibre map placed
   UNDER Leaflet's panes and slaved to Leaflet's camera. Leaflet keeps
   every gesture, marker, route and the rotation logic unchanged.

   Camera mapping:
     • zoom    — MapLibre tiles are 512px, Leaflet's 256px → z − 1
     • bearing — leaflet-rotate setBearing(B) turns the map CLOCKWISE by B;
                 MapLibre bearing β puts compass β at the top, i.e. turns
                 it counter-clockwise by β → β = −B
   ════════════════════════════════════════════════════════════════ */

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Leaflet's zoom animation is a CSS transition: transform .25s cubic-bezier(0,0,.25,1)
// on the panes (leaflet.css .leaflet-zoom-anim). To stay glued to markers and
// routes the basemap must follow that exact curve, not an approximation.
const ZOOM_MS = 250;
function cubicBezier(x1, y1, x2, y2) {
  const bx = (t) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3;
  const by = (t) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 24; i++) { t = (lo + hi) / 2; if (bx(t) < x) lo = t; else hi = t; }
    return by(t);
  };
}
const LEAFLET_ZOOM_CURVE = cubicBezier(0, 0, 0.25, 1);

// The stock styles prefer English/transliterated names ("… Street"); show the
// local OSM name (Uzbek where mapped) instead.
const LOCAL_NAME = ['coalesce', ['get', 'name:uz'], ['get', 'name'], ['get', 'name:latin']];
function localizeLabels(gl) {
  for (const layer of gl.getStyle()?.layers || []) {
    if (layer.type !== 'symbol' || !layer.layout?.['text-field']) continue;
    const src = JSON.stringify(layer.layout['text-field']);
    if (!/name/.test(src) || /ref|housenumber/.test(src)) continue; // keep road numbers / house numbers
    try { gl.setLayoutProperty(layer.id, 'text-field', LOCAL_NAME); } catch { /* layer without text */ }
  }
}

export function vectorBasemapSupported() {
  const ml = maplibregl;
  if (!ml) return false;
  try {
    if (typeof ml.supported === 'function') return ml.supported();
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

/**
 * Attach a MapLibre basemap under a Leaflet map.
 * `onFail` fires once if the style or WebGL context can't be used, so the
 * caller can fall back to raster tiles.
 */
export function createVectorBasemap(map, onFail) {
  const ml = maplibregl;
  const container = map.getContainer();
  const el = document.createElement('div');
  el.className = 'otw-vector-basemap';
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:absolute;inset:0;z-index:0;pointer-events:none;';
  container.insertBefore(el, container.firstChild);

  const cam = () => {
    const c = map.getCenter();
    return { center: [c.lng, c.lat], zoom: Math.max(0, map.getZoom() - 1),
      bearing: -(typeof map.getBearing === 'function' ? map.getBearing() : 0) };
  };

  let gl = null, currentUrl = null, failed = false, zoomAnim = false;
  const fail = (e) => { if (failed) return; failed = true; console.warn('[vectorBasemap]', e); onFail?.(e); };

  const ensure = (url) => {
    if (gl) return gl;
    gl = new ml.Map({
      container: el, style: url, ...cam(),
      interactive: false, attributionControl: false,
      fadeDuration: 0,            // labels appear at once while panning
      pitchWithRotate: false, renderWorldCopies: false,
      maxZoom: 22,
      // QA screenshots need to read the canvas back; costs a little, so dev `?qa` only.
      preserveDrawingBuffer: /[?&]qa\b/.test(window.location.search),
    });
    gl.on('error', (ev) => {
      // A missing tile or sprite is harmless; a style that never loads is not.
      if (!gl.isStyleLoaded() && !gl.loaded()) fail(ev?.error || ev);
    });
    gl.on('webglcontextlost', () => fail(new Error('WebGL context lost')));
    gl.on('style.load', () => localizeLabels(gl));
    if (/[?&]qa\b/.test(window.location.search)) window.__otwGL = gl;
    return gl;
  };

  // Leaflet moves its panes synchronously inside the move/rotate event; a plain
  // jumpTo would only paint on MapLibre's NEXT frame, so the basemap trailed the
  // markers by one frame while dragging. redraw() paints in the same frame.
  const sync = () => {
    if (!gl || zoomAnim) return;
    gl.jumpTo(cam());
    if (typeof gl.redraw === 'function' && gl.isStyleLoaded()) gl.redraw();
  };
  // Leaflet's zoom animation CSS-transitions the pane SCALE linearly along the
  // bezier, about a fixed point. MapLibre eases ZOOM (log2 of scale), so map the
  // curve into zoom space and pin the same fixed point with `around` —
  // the basemap then lands on every intermediate frame where the markers are.
  const onZoomAnim = (e) => {
    if (!gl) return;
    const z0 = map.getZoom(), z1 = e.zoom;
    const s = Math.pow(2, z1 - z0);
    if (Math.abs(z1 - z0) < 1e-6) return;
    const c0 = map.project(map.getCenter(), 0), c1 = map.project(e.center, 0);
    const k0 = Math.pow(2, z0), k1 = Math.pow(2, z1);
    const fixed = map.unproject(c0.multiplyBy(k0).subtract(c1.multiplyBy(k1)).divideBy(k0 - k1), 0);
    zoomAnim = true;
    gl.stop();
    gl.easeTo({
      center: [e.center.lng, e.center.lat], zoom: Math.max(0, z1 - 1), bearing: cam().bearing,
      around: [fixed.lng, fixed.lat], duration: ZOOM_MS,
      easing: (t) => Math.log2(1 + (s - 1) * LEAFLET_ZOOM_CURVE(t)) / Math.log2(s),
    });
  };
  const onZoomEnd = () => { zoomAnim = false; sync(); };
  const onResize = () => { if (gl) { gl.resize(); sync(); } };

  map.on('move zoom rotate viewreset', sync);
  map.on('zoomanim', onZoomAnim);
  map.on('zoomend', onZoomEnd);
  map.on('resize', onResize);

  return {
    /** Show the basemap with `url` (a MapLibre style URL). */
    show(url) {
      if (failed) return false;
      el.style.display = '';
      if (!gl) ensure(url);
      else if (url !== currentUrl) gl.setStyle(url);
      currentUrl = url;
      gl.resize(); sync();
      return true;
    },
    /** Hide it (e.g. while a raster style such as satellite is active). */
    hide() { el.style.display = 'none'; },
    get failed() { return failed; },
    dispose() {
      map.off('move zoom rotate viewreset', sync);
      map.off('zoomanim', onZoomAnim);
      map.off('zoomend', onZoomEnd);
      map.off('resize', onResize);
      try { gl?.remove(); } catch { /* already gone */ }
      el.remove(); gl = null;
    },
  };
}
