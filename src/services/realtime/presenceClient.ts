/* ════════════════════════════════════════════════════════════════
   PRESENCE CLIENT — /hubs/presence (singleton).
   Tracks online users + live walker positions and shares routes. Server→
   client events mirror IPresenceClient; client→server calls mirror the hub
   methods. Subscribe with on(event, handler); it returns an unsubscribe fn.
   ════════════════════════════════════════════════════════════════ */

import type { HubConnection } from '@microsoft/signalr';
import { createHubConnection, startConnection } from './hubConnection';

// Server→client events (must match the C# IPresenceClient method names).
const EVENTS = [
  'UserOnline', 'UserOffline', 'OnlineUsers',
  'Walkers', 'WalkerJoined', 'WalkerMoved', 'WalkerGone',
  'RoutePublished', 'RouteCleared',
  'BookingEvent',
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = any;
type Handler = (payload: Payload) => void;

interface PresencePosition { userId: string; lat: number; lng: number; heading?: number; role?: string; updatedAtUtc?: string }

let connection: HubConnection | null = null;
let currentMode: string | null = null; // last announced search role
const listeners = new Map<string, Set<Handler>>();

const positions = new Map<string, PresencePosition>();
const onlineIds = new Set<string>();

function emit(event: string, payload: Payload) {
  listeners.get(event)?.forEach((fn) => {
    try { fn(payload); } catch (e) { console.error(`[presence] ${event} handler`, e); }
  });
}

function updateCaches(event: string, payload: Payload) {
  switch (event) {
    case 'OnlineUsers': onlineIds.clear(); (payload || []).forEach((id: string) => onlineIds.add(id)); break;
    case 'UserOnline': onlineIds.add(payload); break;
    case 'UserOffline': onlineIds.delete(payload); break;
    case 'Walkers': (payload || []).forEach((p: PresencePosition) => positions.set(p.userId, p)); break;
    case 'WalkerJoined': if (payload) positions.set(payload.userId, payload); break;
    case 'WalkerMoved': if (payload) positions.set(payload.userId, payload); break;
    case 'WalkerGone': positions.delete(payload); break;
    default: break;
  }
}

function ensureConnection(): HubConnection {
  if (connection) return connection;
  const conn = createHubConnection('/hubs/presence');
  connection = conn;
  EVENTS.forEach((ev) => conn.on(ev, (payload: Payload) => { updateCaches(ev, payload); emit(ev, payload); }));
  conn.onreconnected(() => {
    positions.clear(); // server re-seeds via Walkers…
    if (currentMode) conn.invoke('SetRole', currentMode).catch(() => {}); // …once we re-announce our role
  });
  return conn;
}

const connected = (): HubConnection | null => (connection && connection.state === 'Connected' ? connection : null);

export const presenceClient = {
  /** Subscribe to a server event. Returns an unsubscribe function. */
  on(event: string, handler: Handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(handler);
    return () => listeners.get(event)?.delete(handler);
  },

  async connect() {
    await startConnection(ensureConnection());
  },

  async disconnect() {
    if (connection) { try { await connection.stop(); } catch { /* ignore */ } }
    connection = null;
  },

  isConnected(): boolean {
    return connection?.state === 'Connected';
  },

  /** Snapshot of all known live positions. */
  getPositions(): PresencePosition[] {
    return [...positions.values()];
  },

  /** Set of currently-online user ids. */
  getOnlineIds(): string[] {
    return [...onlineIds];
  },

  // --- client→server -------------------------------------------------

  setMode(role: string | null) {
    currentMode = role || null;
    const c = connected();
    if (currentMode && c) return c.invoke('SetRole', currentMode);
    return Promise.resolve();
  },

  updateLocation(lat: number, lng: number, heading: number | null = null) {
    return connected()?.invoke('UpdateLocation', lat, lng, heading) ?? Promise.resolve();
  },

  stopSharing() {
    return connected()?.invoke('StopSharing') ?? Promise.resolve();
  },

  publishRoute(routeDto: unknown) {
    return connected()?.invoke('PublishRoute', routeDto) ?? Promise.resolve();
  },

  clearRoute() {
    return connected()?.invoke('ClearRoute') ?? Promise.resolve();
  },

  watchRoute(walkerUserId: string) {
    return connected()?.invoke('WatchRoute', walkerUserId) ?? Promise.resolve();
  },

  unwatchRoute(walkerUserId: string) {
    return connected()?.invoke('UnwatchRoute', walkerUserId) ?? Promise.resolve();
  },

  // --- session state (retained server-side across disconnects) ---------

  syncWalkerState(delta: unknown) {
    return connected()?.invoke('SyncWalkerState', delta) ?? Promise.resolve(null);
  },

  getWalkerState(): Promise<{ state?: Record<string, unknown>; activeTrip?: unknown; bookings?: unknown[] } | null> {
    return connected()?.invoke('GetWalkerState') ?? Promise.resolve(null);
  },
};
