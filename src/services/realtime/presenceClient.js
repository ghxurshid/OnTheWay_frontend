/* ════════════════════════════════════════════════════════════════
   PRESENCE CLIENT — /hubs/presence (singleton).
   Tracks online users + live walker positions and shares routes. Server→
   client events mirror IPresenceClient; client→server calls mirror the hub
   methods. Subscribe with on(event, handler); it returns an unsubscribe fn.
   ════════════════════════════════════════════════════════════════ */

import { createHubConnection, startConnection } from './hubConnection';

// Server→client events (must match the C# IPresenceClient method names).
const EVENTS = [
  'UserOnline', 'UserOffline', 'OnlineUsers',
  'Walkers', 'WalkerMoved', 'WalkerGone',
  'RoutePublished', 'RouteCleared',
];

let connection = null;
const listeners = new Map(); // event → Set<handler>

// Live caches, kept current from connect time so a screen that opens later
// (e.g. the map) reads the present state instead of missing earlier events.
const positions = new Map(); // userId → { userId, lat, lng, heading, updatedAtUtc }
const onlineIds = new Set(); // userId

function emit(event, payload) {
  listeners.get(event)?.forEach((fn) => {
    try { fn(payload); } catch (e) { console.error(`[presence] ${event} handler`, e); }
  });
}

function updateCaches(event, payload) {
  switch (event) {
    case 'OnlineUsers': onlineIds.clear(); (payload || []).forEach((id) => onlineIds.add(id)); break;
    case 'UserOnline': onlineIds.add(payload); break;
    case 'UserOffline': onlineIds.delete(payload); break;
    case 'Walkers': (payload || []).forEach((p) => positions.set(p.userId, p)); break;
    case 'WalkerMoved': if (payload) positions.set(payload.userId, payload); break;
    case 'WalkerGone': positions.delete(payload); break;
    default: break;
  }
}

function ensureConnection() {
  if (connection) return connection;
  connection = createHubConnection('/hubs/presence');
  EVENTS.forEach((ev) => connection.on(ev, (payload) => { updateCaches(ev, payload); emit(ev, payload); }));
  connection.onreconnected(() => positions.clear()); // server re-seeds via Walkers
  return connection;
}

export const presenceClient = {
  /** Subscribe to a server event. Returns an unsubscribe function. */
  on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
    return () => listeners.get(event)?.delete(handler);
  },

  async connect() {
    await startConnection(ensureConnection());
  },

  async disconnect() {
    if (connection) { try { await connection.stop(); } catch { /* ignore */ } }
    connection = null;
  },

  isConnected() {
    return connection?.state === 'Connected';
  },

  /** Snapshot of all known live positions (array of WalkerPositionDto). */
  getPositions() {
    return [...positions.values()];
  },

  /** Set of currently-online user ids. */
  getOnlineIds() {
    return [...onlineIds];
  },

  // --- client→server -------------------------------------------------
  updateLocation(lat, lng, heading = null) {
    if (this.isConnected()) return connection.invoke('UpdateLocation', lat, lng, heading);
    return Promise.resolve();
  },

  publishRoute(routeDto) {
    if (this.isConnected()) return connection.invoke('PublishRoute', routeDto);
    return Promise.resolve();
  },

  clearRoute() {
    if (this.isConnected()) return connection.invoke('ClearRoute');
    return Promise.resolve();
  },

  watchRoute(walkerUserId) {
    if (this.isConnected()) return connection.invoke('WatchRoute', walkerUserId);
    return Promise.resolve();
  },

  unwatchRoute(walkerUserId) {
    if (this.isConnected()) return connection.invoke('UnwatchRoute', walkerUserId);
    return Promise.resolve();
  },
};
