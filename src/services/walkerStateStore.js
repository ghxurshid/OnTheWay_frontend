/* ════════════════════════════════════════════════════════════════
   SERVICE — walker session state (the client's local model).
   The single client-side source of truth for the walker's live session:
   role, free mode, active trip, watched walkers, last location. Mutations are
   client-authoritative and synced to the server over SignalR; on app reopen the
   store is rehydrated from the server snapshot so the session is restored.
   Persisted to localStorage as a warm cache until the server sync lands.
   ════════════════════════════════════════════════════════════════ */

import { presenceClient } from '@/services/realtime';

const KEY = 'ontheway_walker_state_v1';

const DEFAULT = {
  role: null,            // 'driver' | 'passenger'
  freeMode: false,       // destination-less live sharing (driver-only)
  activeTripId: null,    // read-only reference to the current trip
  watchedWalkerIds: [],
  lat: null, lng: null, heading: null,
  version: 0,
  updatedAt: null,
};

let state = load();
const listeners = new Set();

function load() {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULT }; }
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } }
function emit() {
  listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error('[walkerState]', e); } });
}

// Only these fields are client-owned and pushed to the server. `role` rides the
// existing SetRole channel; `lat/lng` ride UpdateLocation — so neither is here.
const WIRE_FIELDS = ['freeMode', 'activeTripId', 'clearActiveTrip', 'watchedWalkerIds'];

export const walkerStateStore = {
  get: () => state,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  /** Apply a local change and sync the client-owned fields to the server. */
  patch(delta) {
    const next = { ...state };
    if (delta.role !== undefined) next.role = delta.role;
    if (delta.freeMode !== undefined) next.freeMode = delta.freeMode;
    if (delta.watchedWalkerIds !== undefined) next.watchedWalkerIds = delta.watchedWalkerIds;
    if (delta.clearActiveTrip) next.activeTripId = null;
    else if (delta.activeTripId !== undefined) next.activeTripId = delta.activeTripId;
    if (delta.lat !== undefined) next.lat = delta.lat;
    if (delta.lng !== undefined) next.lng = delta.lng;
    if (delta.heading !== undefined) next.heading = delta.heading;
    next.updatedAt = Date.now();
    state = next;
    persist(); emit();

    const wire = {};
    WIRE_FIELDS.forEach((k) => { if (delta[k] !== undefined) wire[k] = delta[k]; });
    if (Object.keys(wire).length) presenceClient.syncWalkerState(wire).catch(() => {});
    return state;
  },

  /** Replace local state from a server snapshot (restore) — does NOT re-sync. */
  hydrate(serverState) {
    if (!serverState) return state;
    state = {
      ...state,
      role: serverState.role ?? state.role,
      freeMode: !!serverState.freeMode,
      activeTripId: serverState.activeTripId ?? null,
      watchedWalkerIds: serverState.watchedWalkerIds || [],
      lat: serverState.lat ?? state.lat,
      lng: serverState.lng ?? state.lng,
      heading: serverState.heading ?? state.heading,
      version: serverState.version ?? state.version,
      updatedAt: Date.now(),
    };
    persist(); emit();
    return state;
  },

  /** Fetch the server snapshot and rehydrate the local model on app reopen.
      Returns { state, activeTrip, bookings } | null. */
  async restoreFromServer() {
    const snap = await presenceClient.getWalkerState().catch(() => null);
    if (snap && snap.state) this.hydrate(snap.state);
    return snap;
  },

  /** True when there's a session worth restoring (a trip in flight or bookings). */
  hasActiveSession(snap) {
    return !!(snap && (snap.activeTrip || (snap.bookings && snap.bookings.length)));
  },

  reset() { state = { ...DEFAULT }; persist(); emit(); },
};
