import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHeadingSync, createVectorGestureSync } from './mapRenderSync';

/* Minimal Leaflet stand-ins: an Evented-like map (listeners fire in insertion
   order, as Leaflet does) plus the two internals each sync reaches into. */
function fakeMap(bearing = 0) {
  const handlers: Record<string, Array<() => void>> = {};
  return {
    _bearing: bearing,
    _center: 'C',
    _zoom: 14,
    on(type: string, fn: () => void) { (handlers[type] ||= []).push(fn); },
    off(type: string, fn: () => void) {
      handlers[type] = (handlers[type] || []).filter((h) => h !== fn);
    },
    fire(type: string) { (handlers[type] || []).slice().forEach((h) => h()); },
    getBearing() { return this._bearing; },
    getCenter() { return this._center; },
    getZoom() { return this._zoom; },
    /** Rotate like leaflet-rotate's setBearing: move, then fire 'rotate'. */
    rotateTo(deg: number) { this._bearing = deg; this.fire('rotate'); },
    listenerCount(type: string) { return (handlers[type] || []).length; },
  };
}

function fakeMarker() {
  const icon = document.createElement('div');
  const arrow = document.createElement('div');
  arrow.className = 'me-arrow';
  icon.appendChild(arrow);
  document.body.appendChild(icon);
  return { _icon: icon, arrow };
}

/** Degrees currently written to the arrow, or null if it was never painted. */
const painted = (arrow: HTMLElement): number | null => {
  const m = /rotate\((-?[\d.]+)deg\)/.exec(arrow.style.transform);
  return m ? Number(m[1]) : null;
};

describe('createHeadingSync', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('draws the heading in screen space (heading + bearing)', () => {
    const map = fakeMap(0);
    const mk = fakeMarker();
    const sync = createHeadingSync(map, () => mk);
    sync.setHeading(90);
    expect(painted(mk.arrow)).toBe(90);   // north-up map: screen angle = heading
    sync.dispose();
  });

  it('turns the arrow WITH the map when the bearing changes', () => {
    const map = fakeMap(0);
    const mk = fakeMarker();
    const sync = createHeadingSync(map, () => mk);
    sync.setHeading(90);  // heading east, drawn pointing right

    // setBearing(B) turns the map clockwise by B, so everything drawn on it —
    // the arrow included — must move clockwise by B too.
    map.rotateTo(30);
    expect(painted(mk.arrow)).toBe(120);
    map.rotateTo(270);
    expect(painted(mk.arrow)).toBe(360);  // heading-up: east is now screen-up
    sync.dispose();
  });

  it('pins the arrow to screen-up while follow mode owns the bearing', () => {
    const map = fakeMap(0);
    const mk = fakeMarker();
    const sync = createHeadingSync(map, () => mk);
    sync.setHeading(90);
    sync.setScreenLocked(true);
    expect(painted(mk.arrow)).toBe(0);

    // The map is still easing toward the heading — the arrow must not wobble.
    map.rotateTo(45);
    expect(painted(mk.arrow)).toBe(0);
    map.rotateTo(90);
    expect(painted(mk.arrow)).toBe(0);
    sync.dispose();
  });

  it('keeps the lock sticky when no explicit mode is passed', () => {
    const map = fakeMap(0);
    const mk = fakeMarker();
    const sync = createHeadingSync(map, () => mk);
    sync.setHeading(90);
    sync.setScreenLocked(true);

    sync.setScreenLocked(undefined); // an incidental setUserLocation call
    map.rotateTo(45);
    expect(painted(mk.arrow)).toBe(0);

    sync.setScreenLocked(false);     // follow explicitly turned off
    expect(painted(mk.arrow)).toBe(135);
    sync.dispose();
  });

  it('keeps the last heading when a fix arrives without one', () => {
    const map = fakeMap(0);
    const mk = fakeMarker();
    const sync = createHeadingSync(map, () => mk);
    sync.setHeading(120);
    sync.setHeading(null);
    sync.setHeading(undefined);
    expect(painted(mk.arrow)).toBe(120);
    sync.dispose();
  });

  it('re-binds after the marker icon is rebuilt', () => {
    const map = fakeMap(0);
    let mk = fakeMarker();
    const sync = createHeadingSync(map, () => mk);
    sync.setHeading(90);

    mk.arrow.remove();          // clearWalkers() → marker destroyed
    mk = fakeMarker();          // …and recreated by the next setUserLocation
    sync.refresh();
    expect(painted(mk.arrow)).toBe(90);
    sync.dispose();
  });

  it('detaches its map listener on dispose', () => {
    const map = fakeMap(0);
    const mk = fakeMarker();
    const sync = createHeadingSync(map, () => mk);
    expect(map.listenerCount('rotate')).toBe(1);
    sync.dispose();
    expect(map.listenerCount('rotate')).toBe(0);
  });
});

/* The renderer only needs the members the sync touches: the `_update` that
   leaflet-rotate wires to 'rotate' (and which used to clobber the projection
   baseline mid-pinch) and the transform/reset pair Leaflet drives. */
function fakeRenderer() {
  return {
    _map: null as unknown,
    _container: {} as unknown,
    baselineResets: 0,
    transforms: [] as Array<[unknown, number]>,
    resets: 0,
    _update() { this.baselineResets++; },
    _updateTransform(center: unknown, zoom: number) { this.transforms.push([center, zoom]); },
    _onZoom() { this._updateTransform((this._map as any).getCenter(), (this._map as any).getZoom()); },
    _reset() { this.resets++; },
    // leaflet-rotate adds `rotate`; the rest is stock L.Renderer.
    getEvents() { return { rotate: this._update, moveend: this._update, zoom: this._onZoom }; },
  };
}

/**
 * Model `L.Layer._layerAdd`: getEvents() is called ONCE and the RESOLVED
 * function references are stored in the map's listener list. Anything patched
 * onto the renderer after this point is invisible to those handlers — which is
 * exactly why the sync must patch before the renderer reaches the map.
 */
function addRenderer(map: ReturnType<typeof fakeMap>, r: ReturnType<typeof fakeRenderer>) {
  r._map = map;
  const events = r.getEvents() as Record<string, () => void>;
  Object.keys(events).forEach((type) => map.on(type, () => events[type].call(r)));
}

describe('createVectorGestureSync', () => {
  it('reaches the handlers Leaflet resolved at add time', () => {
    const map = fakeMap();
    const r = fakeRenderer();
    const sync = createVectorGestureSync(r);   // patched BEFORE the map sees it
    addRenderer(map, r);
    sync.attach(map);

    map.fire('zoomstart');
    map.fire('rotate');                        // goes through the stored ref
    expect(r.baselineResets).toBe(0);          // the patch really is in the path
    sync.dispose();
  });

  it('freezes the projection baseline for the whole pinch', () => {
    const map = fakeMap();
    const r = fakeRenderer();
    const sync = createVectorGestureSync(r);
    addRenderer(map, r);
    sync.attach(map);

    // Outside a gesture (compass rotation) the renderer works normally.
    map.rotateTo(10);
    expect(r.baselineResets).toBe(1);

    map.fire('zoomstart');
    expect(sync.isGesturing()).toBe(true);

    // A pinch frame: leaflet-rotate fires 'rotate' from setBearing, then the
    // rAF'd map._move fires 'zoom'. The baseline must NOT move, so the scale
    // stays relative to the pinch-start zoom instead of collapsing to ~1.
    map._zoom = 15;
    map.rotateTo(12);
    map.fire('zoom');
    map._zoom = 16;
    map.rotateTo(14);
    map.fire('zoom');

    expect(r.baselineResets).toBe(1);          // still frozen at pinch start
    expect(r.transforms).toEqual([['C', 15], ['C', 15], ['C', 16], ['C', 16]]);

    map.fire('zoomend');
    expect(sync.isGesturing()).toBe(false);
    expect(r.resets).toBe(1);                  // full resync once, on settle
    map.rotateTo(20);
    expect(r.baselineResets).toBe(2);          // normal behaviour restored
    sync.dispose();
  });

  it('flushes deferred geometry exactly once per gesture', () => {
    const map = fakeMap();
    const r = fakeRenderer();
    const sync = createVectorGestureSync(r);
    addRenderer(map, r);
    const onSettle = vi.fn();
    sync.attach(map, onSettle);

    map.fire('zoomstart');
    map.fire('zoomend');
    map.fire('moveend');       // always follows zoomend — must not double-flush
    expect(onSettle).toHaveBeenCalledTimes(1);
    sync.dispose();
  });

  it('releases on moveend when a gesture is interrupted before zoomend', () => {
    const map = fakeMap();
    const r = fakeRenderer();
    const sync = createVectorGestureSync(r);
    addRenderer(map, r);
    const onSettle = vi.fn();
    sync.attach(map, onSettle);

    map.fire('zoomstart');
    map.fire('moveend');
    expect(sync.isGesturing()).toBe(false);
    expect(onSettle).toHaveBeenCalledTimes(1);
    sync.dispose();
  });

  it('restores the original _update and detaches on dispose', () => {
    const map = fakeMap();
    const r = fakeRenderer();
    const original = r._update;
    const sync = createVectorGestureSync(r);
    expect(r._update).not.toBe(original);   // patched on the instance only
    addRenderer(map, r);
    sync.attach(map);

    sync.dispose();
    expect(r._update).toBe(original);
    expect(map.listenerCount('zoomstart')).toBe(0);
    expect(map.listenerCount('zoomend')).toBe(0);
    // The renderer's own moveend handler stays — only the sync's is removed.
    expect(map.listenerCount('moveend')).toBe(1);
  });
});
