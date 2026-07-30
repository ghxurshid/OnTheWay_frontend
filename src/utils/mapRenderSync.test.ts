import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHeadingSync, bindVectorGestureSync } from './mapRenderSync';

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

  it('draws the heading in screen space (heading − bearing)', () => {
    const map = fakeMap(0);
    const mk = fakeMarker();
    const sync = createHeadingSync(map, () => mk);
    sync.setHeading(90);
    expect(painted(mk.arrow)).toBe(90);   // north-up map: screen angle = heading
    sync.dispose();
  });

  it('counter-rotates the arrow when the map bearing changes', () => {
    const map = fakeMap(0);
    const mk = fakeMarker();
    const sync = createHeadingSync(map, () => mk);
    sync.setHeading(90);

    // Two-finger rotate: the map turns, the arrow must keep pointing east.
    map.rotateTo(30);
    expect(painted(mk.arrow)).toBe(60);
    map.rotateTo(90);
    expect(painted(mk.arrow)).toBe(0);    // heading is now straight up on screen
    map.rotateTo(200);
    expect(painted(mk.arrow)).toBe(-110);
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
    expect(painted(mk.arrow)).toBe(45);
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
    _map: {} as unknown,
    _container: {} as unknown,
    baselineResets: 0,
    transforms: [] as Array<[unknown, number]>,
    resets: 0,
    _update() { this.baselineResets++; },
    _updateTransform(center: unknown, zoom: number) { this.transforms.push([center, zoom]); },
    _reset() { this.resets++; },
  };
}

describe('bindVectorGestureSync', () => {
  it('freezes the projection baseline for the whole pinch', () => {
    const map = fakeMap();
    const r = fakeRenderer();
    r._map = map;
    const sync = bindVectorGestureSync(map, () => r);

    // Outside a gesture (compass rotation) the renderer works normally.
    map.fire('rotate');
    r._update();
    expect(r.baselineResets).toBe(1);

    map.fire('zoomstart');
    expect(sync.isGesturing()).toBe(true);

    // Every pinch frame fires 'rotate' → _update. The baseline must NOT move;
    // instead the container transform is re-applied from the frozen one.
    map._zoom = 15;
    r._update();
    map._zoom = 16;
    r._update();
    expect(r.baselineResets).toBe(1);          // still frozen at pinch start
    expect(r.transforms).toEqual([['C', 15], ['C', 16]]);

    map.fire('zoomend');
    expect(sync.isGesturing()).toBe(false);
    expect(r.resets).toBe(1);                  // full resync once, on settle
    r._update();
    expect(r.baselineResets).toBe(2);          // normal behaviour restored
    sync.dispose();
  });

  it('flushes deferred geometry exactly once per gesture', () => {
    const map = fakeMap();
    const r = fakeRenderer();
    r._map = map;
    const onSettle = vi.fn();
    const sync = bindVectorGestureSync(map, () => r, onSettle);

    map.fire('zoomstart');
    map.fire('zoomend');
    map.fire('moveend');       // always follows zoomend — must not double-flush
    expect(onSettle).toHaveBeenCalledTimes(1);
    sync.dispose();
  });

  it('releases on moveend when a gesture is interrupted before zoomend', () => {
    const map = fakeMap();
    const r = fakeRenderer();
    r._map = map;
    const onSettle = vi.fn();
    const sync = bindVectorGestureSync(map, () => r, onSettle);

    map.fire('zoomstart');
    map.fire('moveend');
    expect(sync.isGesturing()).toBe(false);
    expect(onSettle).toHaveBeenCalledTimes(1);
    sync.dispose();
  });

  it('restores the original _update and detaches on dispose', () => {
    const map = fakeMap();
    const r = fakeRenderer();
    r._map = map;
    const original = r._update;
    const sync = bindVectorGestureSync(map, () => r);

    map.fire('zoomstart');
    expect(r._update).not.toBe(original);   // patched on the instance only
    sync.dispose();
    expect(r._update).toBe(original);
    expect(map.listenerCount('zoomstart')).toBe(0);
    expect(map.listenerCount('zoomend')).toBe(0);
    expect(map.listenerCount('moveend')).toBe(0);
  });
});
