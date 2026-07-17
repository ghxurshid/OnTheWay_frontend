/* ════════════════════════════════════════════════════════════════
   SERVICE — walker session state (the client's local model).
   The single client-side source of truth for the walker's live session:
   role, free mode, active trip, watched walkers, last location. Mutations are
   client-authoritative and synced to the server over SignalR; on app reopen the
   store is rehydrated from the server snapshot so the session is restored.
   ════════════════════════════════════════════════════════════════ */

import { presenceClient } from '@/services/realtime';

const KEY = 'ontheway_walker_state_v1';

export interface WalkerState {
  role: 'driver' | 'passenger' | null;
  freeMode: boolean;
  activeTripId: string | null;
  watchedWalkerIds: string[];
  lat: number | null;
  lng: number | null;
  heading: number | null;
  version: number;
  updatedAt: number | null;
}

/** A local mutation: any subset of the state plus the clearActiveTrip flag. */
export type WalkerStateDelta = Partial<WalkerState> & { clearActiveTrip?: boolean };

const DEFAULT: WalkerState = {
  role: null,
  freeMode: false,
  activeTripId: null,
  watchedWalkerIds: [],
  lat: null, lng: null, heading: null,
  version: 0,
  updatedAt: null,
};

let state: WalkerState = load();
const listeners = new Set<(s: WalkerState) => void>();

function load(): WalkerState {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULT }; }
}
function persist(): void { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } }
function emit(): void {
  listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error('[walkerState]', e); } });
}

// Only these fields are client-owned and pushed to the server. `role` rides the
// existing SetRole channel; `lat/lng` ride UpdateLocation — so neither is here.
const WIRE_FIELDS = ['freeMode', 'activeTripId', 'clearActiveTrip', 'watchedWalkerIds'] as const;

export const walkerStateStore = {
  get: (): WalkerState => state,
  subscribe(fn: (s: WalkerState) => void) { listeners.add(fn); return () => listeners.delete(fn); },

  /** Apply a local change and sync the client-owned fields to the server. */
  patch(delta: WalkerStateDelta): WalkerState {
    const next: WalkerState = { ...state };
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

    const wire: Record<string, unknown> = {};
    WIRE_FIELDS.forEach((k) => { if (delta[k] !== undefined) wire[k] = delta[k]; });
    // Client-side ids are strings, but the hub's WalkerStateDelta.ActiveTripId is
    // a long — a string here fails the whole binding silently, so convert.
    if (wire.activeTripId != null) {
      const n = Number(wire.activeTripId);
      if (Number.isFinite(n)) wire.activeTripId = n; else delete wire.activeTripId;
    }
    if (Object.keys(wire).length) presenceClient.syncWalkerState(wire).catch(() => {});
    return state;
  },

  /** Replace local state from a server snapshot (restore) — does NOT re-sync. */
  hydrate(serverState: Partial<WalkerState> | null | undefined): WalkerState {
    if (!serverState) return state;
    state = {
      ...state,
      role: serverState.role ?? state.role,
      freeMode: !!serverState.freeMode,
      activeTripId: serverState.activeTripId != null ? String(serverState.activeTripId) : null,
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

  /** Fetch the server snapshot and rehydrate the local model on app reopen. */
  async restoreFromServer(): Promise<{ state?: Partial<WalkerState>; activeTrip?: unknown; bookings?: unknown[] } | null> {
    const snap = await presenceClient.getWalkerState().catch(() => null);
    if (snap && snap.state) this.hydrate(snap.state);
    return snap;
  },

  /** True when there's a session worth restoring (a trip in flight or bookings). */
  hasActiveSession(snap: { activeTrip?: unknown; bookings?: unknown[] } | null): boolean {
    return !!(snap && (snap.activeTrip || (snap.bookings && snap.bookings.length)));
  },

  reset() { state = { ...DEFAULT }; persist(); emit(); },
};
