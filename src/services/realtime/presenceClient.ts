/* ════════════════════════════════════════════════════════════════
   PRESENCE CLIENT — /hubs/presence (singleton).
   Tracks online users + live walker positions and shares routes. Server→
   client events mirror IPresenceClient; client→server calls mirror the hub
   methods. Subscribe with on(event, handler); it returns an unsubscribe fn.
   ════════════════════════════════════════════════════════════════ */

import { createEmitter, createHubClient } from './hubConnection';

// Server→client events (must match the C# IPresenceClient method names).
const EVENTS = [
  'UserOnline', 'UserOffline', 'OnlineUsers',
  'Walkers', 'WalkerJoined', 'WalkerMoved', 'WalkerGone',
  'RoutePublished', 'RouteCleared',
  'TripEvent',
] as const;

type Payload = any;

interface PresencePosition { userId: string; lat: number; lng: number; heading?: number; role?: string; updatedAtUtc?: string }

let currentMode: string | null = null; // last announced search role
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

const events = createEmitter('presence');
const hub = createHubClient('/hubs/presence', (conn) => {
  EVENTS.forEach((ev) => conn.on(ev, (payload: Payload) => { updateCaches(ev, payload); events.emit(ev, payload); }));
  conn.onreconnected(() => {
    positions.clear(); // server re-seeds via Walkers…
    if (currentMode) conn.invoke('SetRole', currentMode).catch(() => {}); // …once we re-announce our role
  });
});

/** Client→server call; resolves to `fallback` (no-op) while disconnected. */
const invoke = <T = void>(method: string, fallback: T, ...args: unknown[]): Promise<T> =>
  hub.connected()?.invoke(method, ...args) ?? Promise.resolve(fallback);

export const presenceClient = {
  /** Subscribe to a server event. Returns an unsubscribe function. */
  on: events.on,
  connect: hub.connect,
  disconnect: hub.disconnect,
  isConnected: hub.isConnected,

  /** Snapshot of all known live positions. */
  getPositions: (): PresencePosition[] => [...positions.values()],

  /** Currently-online user ids. */
  getOnlineIds: (): string[] => [...onlineIds],

  // --- client→server -------------------------------------------------

  setMode(role: string | null) {
    currentMode = role || null;
    return currentMode ? invoke('SetRole', undefined, currentMode) : Promise.resolve();
  },
  updateLocation: (lat: number, lng: number, heading: number | null = null) =>
    invoke('UpdateLocation', undefined, lat, lng, heading),
  stopSharing: () => invoke('StopSharing', undefined),
  publishRoute: (routeDto: unknown) => invoke('PublishRoute', undefined, routeDto),
  clearRoute: () => invoke('ClearRoute', undefined),
  watchRoute: (walkerUserId: string) => invoke('WatchRoute', undefined, walkerUserId),
  unwatchRoute: (walkerUserId: string) => invoke('UnwatchRoute', undefined, walkerUserId),

  /** Mark the walker "engaged/full" (band): withheld from discovery and removed
      from the opposite-role maps in realtime. Reversible via markAvailable. */
  markEngaged: () => invoke('MarkEngaged', undefined),
  /** Clear the engaged flag ("bo'sh"ga qaytish): discoverable again. */
  markAvailable: () => invoke('MarkAvailable', undefined),

  // --- session state (retained server-side across disconnects) ---------

  syncWalkerState: (delta: unknown) => invoke<unknown>('SyncWalkerState', null, delta),
  getWalkerState: () =>
    invoke<{ state?: Record<string, unknown>; activeTrip?: unknown } | null>('GetWalkerState', null),
};
