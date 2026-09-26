/* ════════════════════════════════════════════════════════════════
   SERVICE — walker session state (the client's local model).
   The single client-side source of truth for the walker's live session:
   role, free mode, active trip, watched walkers, last location. Mutations are
   client-authoritative and synced to the server over SignalR; on app reopen the
   store is rehydrated from the server snapshot so the session is restored.
   ════════════════════════════════════════════════════════════════ */

import { presenceClient } from '@/services/realtime';
import { readJson, writeJson } from '@/utils/storage';

const KEY = 'ontheway_walker_state_v1';
/** How long the boot waits for the presence connection before giving up on restoring. */
const RESTORE_WAIT_MS = 8000;

export interface WalkerState {
  role: 'driver' | 'passenger' | null;
  freeMode: boolean;
  engaged: boolean;            // "band/to'ldi" — hidden from discovery, reversible
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
  engaged: false,
  activeTripId: null,
  watchedWalkerIds: [],
  lat: null, lng: null, heading: null,
  version: 0,
  updatedAt: null,
};

/** Fields a local patch may change (version/updatedAt are store-managed). */
const PATCHABLE = ['role', 'freeMode', 'engaged', 'activeTripId', 'watchedWalkerIds', 'lat', 'lng', 'heading'] as const;
// Only these fields are client-owned and pushed to the server. `role` rides the
// existing SetRole channel; `lat/lng` ride UpdateLocation — so neither is here.
const WIRE_FIELDS = ['freeMode', 'engaged', 'activeTripId', 'clearActiveTrip', 'watchedWalkerIds'] as const;

let state: WalkerState = { ...DEFAULT, ...readJson<Partial<WalkerState>>(KEY, {}) };
const listeners = new Set<(s: WalkerState) => void>();

const pick = (delta: WalkerStateDelta, keys: readonly (keyof WalkerStateDelta)[]) =>
  Object.fromEntries(keys.filter((k) => delta[k] !== undefined).map((k) => [k, delta[k]]));

function commit(next: WalkerState): WalkerState {
  state = next;
  writeJson(KEY, state);
  listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error('[walkerState]', e); } });
  return state;
}

export const walkerStateStore = {
  get: (): WalkerState => state,
  subscribe(fn: (s: WalkerState) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },

  /** Apply a local change and sync the client-owned fields to the server. */
  patch(delta: WalkerStateDelta): WalkerState {
    const next: WalkerState = { ...state, ...pick(delta, PATCHABLE), updatedAt: Date.now() };
    if (delta.clearActiveTrip) next.activeTripId = null;
    commit(next);

    const wire = pick(delta, WIRE_FIELDS);
    // Client-side ids are strings, but the hub's WalkerStateDelta.ActiveTripId is
    // a long — send a number (and drop a non-numeric mock id rather than fail).
    if (wire.activeTripId != null) {
      const n = Number(wire.activeTripId);
      if (Number.isFinite(n)) wire.activeTripId = n; else delete wire.activeTripId;
    }
    if (Object.keys(wire).length) presenceClient.syncWalkerState(wire).catch(() => {});
    return state;
  },

  /** Push every client-owned field again — after a reconnect the server may
      have missed patches made while the socket was down (including a cleared
      active trip, which a missing field could not express). */
  resync(): void {
    const { freeMode, engaged, activeTripId, watchedWalkerIds } = state;
    const wire: Record<string, unknown> = { freeMode, engaged, watchedWalkerIds };
    const n = Number(activeTripId);
    if (activeTripId != null && Number.isFinite(n)) wire.activeTripId = n;
    else wire.clearActiveTrip = true;
    presenceClient.syncWalkerState(wire).catch(() => {});
  },

  /** Replace local state from a server snapshot (restore) — does NOT re-sync. */
  hydrate(serverState: Partial<WalkerState> | null | undefined): WalkerState {
    if (!serverState) return state;
    return commit({
      ...state,
      role: serverState.role ?? state.role,
      freeMode: !!serverState.freeMode,
      engaged: !!serverState.engaged,
      activeTripId: serverState.activeTripId != null ? String(serverState.activeTripId) : null,
      watchedWalkerIds: serverState.watchedWalkerIds || [],
      lat: serverState.lat ?? state.lat,
      lng: serverState.lng ?? state.lng,
      heading: serverState.heading ?? state.heading,
      version: serverState.version ?? state.version,
      updatedAt: Date.now(),
    });
  },

  /** Fetch the server snapshot and rehydrate the local model on app reopen. A
      slow or failed first connect is waited for a little (its retries run
      meanwhile) — without the snapshot the session could not be resumed. */
  async restoreFromServer(): Promise<{ state?: Partial<WalkerState>; activeTrip?: unknown } | null> {
    await presenceClient.whenConnected(RESTORE_WAIT_MS);
    const snap = await presenceClient.getWalkerState().catch(() => null);
    if (snap && snap.state) this.hydrate(snap.state);
    return snap;
  },

  reset() { commit({ ...DEFAULT }); },
};
