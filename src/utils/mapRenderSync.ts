/* ════════════════════════════════════════════════════════════════
   MAP RENDER SYNC — frame-accurate glue between the map view and the
   two things that must follow it 1:1 during a gesture:

     1. createHeadingSync    — the "me" marker's heading arrow vs. map bearing
     2. bindVectorGestureSync — the vector renderer (routes) vs. pinch zoom

   Both are pure Leaflet (no React): they attach to a live `L.Map`, write
   only transforms, and are torn down with `dispose()`. Leaflet 1.9 and
   leaflet-rotate ship no types and we deliberately reach into documented
   internals here (`_icon`, `_update`, `_updateTransform`), so the Leaflet
   objects flow as `any` — the same boundary convention as leafletIcons.ts.
   ════════════════════════════════════════════════════════════════ */

type LeafletMap = any;
type LeafletMarker = any;
type LeafletRenderer = any;

/* ════════════════════════════════════════════════════════════════
   1. HEADING SYNC — marker arrow ↔ map bearing
   ────────────────────────────────────────────────────────────────
   leaflet-rotate keeps marker icons upright while the map rotates
   (`L.Marker.options.rotateWithView` defaults to false), so the arrow inside
   the icon is drawn in SCREEN space while the heading it represents is
   GEOGRAPHIC.

   Sign convention — `setBearing(B)` puts `rotate(+B rad)` on the rotate pane
   (leaflet-rotate DomUtil.setTransform), and CSS positive rotation is
   CLOCKWISE, so the whole map turns clockwise by B. A geographic heading H,
   which sits at screen angle H on a north-up map, therefore appears at

       screen = heading + map.getBearing()

   (the plugin's own rotate control confirms it: it draws its north arrow at
   `rotate(+bearing deg)`.) The angle has to be rewritten whenever EITHER term
   changes — including on every frame of a two-finger rotate gesture, not just
   when a GPS fix lands. Writing it only on a fix is what left the arrow stuck
   pointing at its initial direction while the map turned underneath it.

   The two terms are treated differently on purpose, which is what makes this
   feel native:

     • bearing — applied synchronously inside the map's `rotate` event, so the
       arrow turns on the very frame the finger moves it. No debounce, no rAF
       hop, no CSS transition: one composited transform write per event.
     • heading — GPS/compass input is noisy, so it is eased toward its target
       over rAF frames instead of snapping per fix.
   ════════════════════════════════════════════════════════════════ */

/** Fraction of the remaining heading error consumed per frame (~60 Hz). */
const HEADING_EASE = 0.2;
/** Below this the eased heading snaps to its target and the loop stops. */
const HEADING_EPSILON = 0.25;

export interface HeadingSync {
  /** Geographic heading in degrees; `null`/omitted keeps the last known one. */
  setHeading(deg: number | null | undefined): void;
  /**
   * Follow/navigation mode: the MAP carries the heading, so the arrow is
   * pinned to screen-up. Sticky — `undefined` leaves the current mode alone,
   * so incidental `setUserLocation` calls can't silently unlock it.
   */
  setScreenLocked(locked: boolean | undefined): void;
  /** Repaint against the current bearing (after the icon is re-created). */
  refresh(): void;
  dispose(): void;
}

/** Shortest signed delta from `a` to `b` in degrees, in (-180, 180]. */
const shortestDelta = (a: number, b: number): number => ((b - a + 540) % 360) - 180;

/**
 * Keep a marker's `.me-arrow` element pointing at a geographic heading,
 * whatever the map's bearing is.
 *
 * @param map        the live Leaflet map
 * @param getMarker  late-bound accessor — the marker is destroyed and rebuilt
 *                   (clearWalkers → setUserLocation), so it can't be captured
 */
export function createHeadingSync(map: LeafletMap, getMarker: () => LeafletMarker): HeadingSync {
  let heading: number | null = null;   // target geographic heading (deg)
  let shown: number | null = null;     // eased geographic heading currently painted
  let locked = false;                  // follow mode: arrow pinned to screen-up
  let painted: number | null = null;   // last value written to the DOM
  let frame: number | null = null;     // rAF id of the heading easing loop
  let el: HTMLElement | null = null;   // cached arrow element

  // The icon element is recreated whenever the marker is re-added, so re-query
  // as soon as the cached node leaves the document.
  const arrow = (): HTMLElement | null => {
    if (el && el.isConnected) return el;
    const mk = getMarker();
    el = mk && mk._icon ? (mk._icon.querySelector('.me-arrow') as HTMLElement | null) : null;
    return el;
  };

  // One composited write. `translateZ(0)` keeps the arrow on its own GPU layer
  // so a rotation costs a transform, never a repaint of the marker.
  const paint = (deg: number) => {
    const rounded = Math.round(deg * 100) / 100;
    if (rounded === painted) return;
    const a = arrow();
    if (!a) return;
    a.style.transform = `translateZ(0) rotate(${rounded}deg)`;
    painted = rounded;
  };

  // Paint the current state immediately — called from the `rotate` event so the
  // bearing term never lags the gesture by a frame.
  const render = () => {
    if (locked) { paint(0); return; }   // map carries the heading → arrow points up
    if (shown == null) return;          // no heading observed yet: leave as drawn
    paint(shown + (typeof map.getBearing === 'function' ? map.getBearing() : 0));
  };

  // Ease `shown` toward `heading`; stops itself once settled.
  const step = () => {
    frame = null;
    if (shown != null && heading != null) {
      const d = shortestDelta(shown, heading);
      if (Math.abs(d) < HEADING_EPSILON) shown = heading;
      else { shown += d * HEADING_EASE; frame = requestAnimationFrame(step); }
    }
    render();
  };

  const onRotate = () => render();
  map.on('rotate', onRotate);

  return {
    setHeading(deg) {
      if (deg == null || Number.isNaN(deg)) return;   // keep the last known heading
      heading = ((deg % 360) + 360) % 360;
      if (shown == null) { shown = heading; render(); return; }  // first fix: no easing
      if (frame == null) frame = requestAnimationFrame(step);
    },
    setScreenLocked(next) {
      if (next == null || next === locked) return;
      locked = next;
      render();
    },
    refresh() {
      el = null;        // force a re-query (the icon may have been rebuilt)
      painted = null;   // …and a write even if the angle is unchanged
      render();
    },
    dispose() {
      map.off('rotate', onRotate);
      if (frame != null) cancelAnimationFrame(frame);
      frame = null;
      el = null;
    },
  };
}

/* ════════════════════════════════════════════════════════════════
   2. VECTOR GESTURE SYNC — routes ↔ pinch zoom
   ────────────────────────────────────────────────────────────────
   The routes ARE native vector layers (they live in the map's own SVG
   renderer inside the rotate pane), so the fix is not to re-home them — it is
   to stop their projection baseline being destroyed mid-gesture.

   How Leaflet scales vectors during a pinch: the paths stay projected at the
   zoom they were last built for (`renderer._zoom` / `_center` / `_topLeft`),
   and every frame `_updateTransform` puts a single CSS transform on the SVG
   container:  scale = getZoomScale(liveZoom, renderer._zoom). The tiles scale
   the same way, so the two move as one.

   What broke it: leaflet-rotate binds `rotate → renderer._update`, and
   `L.SVG._update` both RESETS that baseline to the live view (via
   `Renderer._update`) and calls `setPosition(container, bounds.min)`, which
   overwrites the container transform — scale included. A two-finger pinch is
   also a rotate gesture: finger wobble makes `setBearing` fire on nearly every
   `touchmove`, so on each frame the pinch scale was wiped and the baseline
   moved to the live zoom, leaving scale = getZoomScale(z, z) ≈ 1. The tiles
   scaled, the route did not, and only `zoomend` (which reprojects every path)
   snapped it into place. That is the lag/flicker.

   The fix: freeze the baseline for the whole zoomstart→zoomend window and
   re-apply the transform from it on every rotate frame. That is exactly what
   stock Leaflet does during a zoom animation, and it makes the tile pane and
   the vector pane scale on one atomic frame. Bounds clipping is a non-issue:
   the renderer is built with `padding: 2` (5× the viewport per axis), far more
   than the ≤1.42× a rotated viewport can need.

   ORDERING IS LOAD-BEARING. `Layer._layerAdd` calls `getEvents()` ONCE and
   stores the resolved function references in the map's listener list, so a
   patch installed after the renderer joins the map would never be reached by
   the `rotate`/`moveend` handlers. `createVectorGestureSync` therefore patches
   the renderer at construction — before it is handed to `L.map()` — and
   `attach(map)` only wires the gesture window afterwards.
   ════════════════════════════════════════════════════════════════ */

export interface VectorGestureSync {
  /** Wire the gesture window. Call AFTER the map exists, before layers. */
  attach(map: LeafletMap, onSettle?: () => void): void;
  /** True between zoomstart and zoomend — geometry writes must be deferred. */
  isGesturing(): boolean;
  dispose(): void;
}

/**
 * @param renderer  the shared vector renderer, freshly built by `L.svg()` and
 *                  NOT yet added to a map (see the ordering note above)
 */
export function createVectorGestureSync(renderer: LeafletRenderer): VectorGestureSync {
  let gesturing = false;
  let map: LeafletMap = null;
  let settleCb: (() => void) | undefined;

  // Shadow `_update` on the INSTANCE only (never the prototype), so no other
  // map or renderer in the app is affected.
  const baseUpdate = renderer._update;
  renderer._update = function patchedUpdate(this: LeafletRenderer, ...args: unknown[]) {
    if (!gesturing) return baseUpdate.apply(this, args);
    // Mid-gesture: keep _zoom/_center/_topLeft exactly where the paths are
    // projected, leave the viewBox alone, and only re-apply the transform — so
    // the SVG scales with the tiles on this very frame instead of being reset.
    if (this._map && this._container) {
      this._updateTransform(this._map.getCenter(), this._map.getZoom());
    }
    return undefined;
  };

  const onZoomStart = () => { gesturing = true; };

  // `zoomend` always precedes `moveend`; `moveend` is a safety release for a
  // gesture that is interrupted (map._stop()) before its zoom animation ends.
  const settle = () => {
    if (!gesturing) return;
    gesturing = false;
    // One full resync: rebuild bounds, re-apply the transform, reproject every
    // path against the settled view. Leaflet's own zoomend/moveend handlers run
    // the same work right after — idempotent, so ordering can't bite us.
    if (renderer._map && renderer._container) renderer._reset();
    if (settleCb) settleCb();
  };

  return {
    attach(nextMap, onSettle) {
      map = nextMap;
      settleCb = onSettle;
      map.on('zoomstart', onZoomStart);
      map.on('zoomend', settle);
      map.on('moveend', settle);
    },
    isGesturing: () => gesturing,
    dispose() {
      if (map) {
        map.off('zoomstart', onZoomStart);
        map.off('zoomend', settle);
        map.off('moveend', settle);
        map = null;
      }
      renderer._update = baseUpdate;
      settleCb = undefined;
      gesturing = false;
    },
  };
}
