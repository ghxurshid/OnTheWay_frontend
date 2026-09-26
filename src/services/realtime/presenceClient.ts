/* ════════════════════════════════════════════════════════════════
   PRESENCE CLIENT — /hubs/presence (singleton).
   Tracks online users + live walker positions and shares routes. Server→
   client events mirror IPresenceClient; client→server calls mirror the hub
   methods. Subscribe with on(event, handler); it returns an unsubscribe fn.

   Every command first records the state it asks for (presenceState), then
   sends it. After each (re)connect that whole state is replayed, so what the
   server holds for this device — role, sharing, "band", route — never drifts
   from what the app shows, whatever happened to the socket in between.
   ════════════════════════════════════════════════════════════════ */

import type { HubConnection } from '@microsoft/signalr';
import { createEmitter, createHubClient } from './hubConnection';
import { createPresenceState } from './presenceState';

// Server→client events (must match the C# IPresenceClient method names).
const EVENTS = [
  'UserOnline', 'UserOffline', 'OnlineUsers',
  'Walkers', 'WalkerJoined', 'WalkerMoved', 'WalkerGone',
  'RoutePublished', 'RouteCleared',
  'TripEvent',
] as const;

type Payload = any;

interface PresencePosition { userId: string; lat: number; lng: number; heading?: number; role?: string; updatedAtUtc?: string }

const desired = createPresenceState();
const positions = new Map<string, PresencePosition>();
const onlineIds = new Set<string>();

function updateCaches(event: string, payload: Payload) {
  switch (event) {
    case 'OnlineUsers': onlineIds.clear(); (payload || []).forEach((id: string) => onlineIds.add(id)); break;
    case 'UserOnline': onlineIds.add(payload); break;
    case 'UserOffline': onlineIds.delete(payload); break;
    case 'Walkers': (payload || []).forEach((p: PresencePosition) => positions.set(p.userId, p)); break;
    case 'WalkerJoined':
    case 'WalkerMoved': if (payload) positions.set(payload.userId, payload); break;
    case 'WalkerGone': positions.delete(payload); break;
    default: break;
  }
}

/** A fresh connection: forget the positions we were shown (the server re-seeds
    them via Walkers once the role is replayed) and rebuild our own state. */
async function resync(conn: HubConnection): Promise<void> {
  positions.clear();
  for (const [method, ...args] of desired.replay()) {
    try {
      await conn.invoke(method, ...args);
    } catch (e) {
      if (conn.state !== 'Connected') throw e; // lost again: the next connect replays it all
      // The server refused this one step (e.g. a stale route); replay the rest.
    }
  }
}

const events = createEmitter('presence');
const hub = createHubClient('/hubs/presence', (conn) => {
  EVENTS.forEach((ev) => conn.on(ev, (payload: Payload) => { updateCaches(ev, payload); events.emit(ev, payload); }));
}, { onConnected: resync });

// Back after a loss: the state is replayed already; let the app refetch the rest.
hub.onReconnected(() => events.emit('Reconnected'));

/** Client→server call; resolves to `fallback` (no-op) while disconnected — the
    recorded state is replayed on the next connect. */
const invoke = <T = void>(method: string, fallback: T, ...args: unknown[]): Promise<T> =>
  hub.connected()?.invoke(method, ...args) ?? Promise.resolve(fallback);

export const presenceClient = {
  /** Subscribe to a server event. Returns an unsubscribe function. */
  on: events.on,
  connect: hub.connect,
  disconnect: hub.disconnect,
  isConnected: hub.isConnected,
  whenConnected: hub.whenConnected,
  /** Connection health (for the "Live" indicator / offline banner). */
  status: hub.status,
  onStatus: hub.onStatus,

  /** Whether the user currently has a live connection (known from presence). */
  isOnline: (userId: string | number): boolean => onlineIds.has(String(userId)),

  /** Snapshot of all known live positions. */
  getPositions: (): PresencePosition[] => [...positions.values()],

  /** Currently-online user ids. */
  getOnlineIds: (): string[] => [...onlineIds],

  // --- client→server (recorded, then sent) ------------------------------

  setMode(role: string | null) {
    desired.setMode(role);
    return desired.mode ? invoke('SetRole', undefined, desired.mode) : Promise.resolve();
  },
  updateLocation(lat: number, lng: number, heading: number | null = null) {
    desired.located({ lat, lng, heading });
    return invoke('UpdateLocation', undefined, lat, lng, heading);
  },
  stopSharing() {
    desired.stopSharing();
    return invoke('StopSharing', undefined);
  },
  publishRoute(routeDto: unknown) {
    desired.setRoute(routeDto);
    return invoke('PublishRoute', undefined, routeDto);
  },
  clearRoute() {
    desired.setRoute(null);
    return invoke('ClearRoute', undefined);
  },
  watchRoute(walkerUserId: string) {
    desired.watch(walkerUserId);
    return invoke('WatchRoute', undefined, walkerUserId);
  },
  unwatchRoute(walkerUserId: string) {
    desired.unwatch(walkerUserId);
    return invoke('UnwatchRoute', undefined, walkerUserId);
  },

  /** Mark the walker "engaged/full" (band): withheld from discovery and removed
      from the opposite-role maps in realtime. Reversible via markAvailable. */
  markEngaged() {
    desired.setEngaged(true);
    return invoke('MarkEngaged', undefined);
  },
  /** Clear the engaged flag ("bo'sh"ga qaytish): discoverable again. */
  markAvailable() {
    desired.setEngaged(false);
    return invoke('MarkAvailable', undefined);
  },

  // --- session state (retained server-side across disconnects) ---------

  syncWalkerState: (delta: unknown) => invoke<unknown>('SyncWalkerState', null, delta),
  getWalkerState: () =>
    invoke<{ state?: Record<string, unknown>; activeTrip?: unknown } | null>('GetWalkerState', null),
};
