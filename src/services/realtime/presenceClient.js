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

function emit(event, payload) {
  listeners.get(event)?.forEach((fn) => {
    try { fn(payload); } catch (e) { console.error(`[presence] ${event} handler`, e); }
  });
}

function ensureConnection() {
  if (connection) return connection;
  connection = createHubConnection('/hubs/presence');
  EVENTS.forEach((ev) => connection.on(ev, (payload) => emit(ev, payload)));
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
