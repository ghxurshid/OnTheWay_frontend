/* ════════════════════════════════════════════════════════════════
   PRESENCE CLIENT — /hubs/presence (singleton).
   Tracks online users + live walker positions and shares routes. Server→
   client events mirror IPresenceClient; client→server calls mirror the hub
   methods. Subscribe with on(event, handler); it returns an unsubscribe fn.

   Every command first records the state it asks for (presenceState), then
   sends it. After each (re)connect that whole state is replayed, so what the
   server holds for this device — role, sharing, "band", route — never drifts
   from what the app shows, whatever happened to the socket in between. A
   command the server asks to slow down (rate_limited: nothing changed there)
   is settled the same way, a little later: what is recorded by then is sent.

   The "ride together" agreement and the "tell me when someone appears" alert
   are server session state on this hub too: changes are pushed, and services
   that keep state of their own (agreementService, walkerAlertService)
   register an `onResync` step that runs after the replay — send what was
   queued offline, then catch up.
   ════════════════════════════════════════════════════════════════ */

import type { HubConnection } from '@microsoft/signalr';
import { createEmitter, createHubClient } from './hubConnection';
import { createPresenceState } from './presenceState';
import { createBackoff, isRateLimited } from './retry';

// Server→client events (must match the C# IPresenceClient method names).
const EVENTS = [
  'UserOnline', 'UserOffline', 'OnlineUsers',
  'Walkers', 'WalkerJoined', 'WalkerMoved', 'WalkerGone',
  'RoutePublished', 'RouteCleared',
  'TripEvent',
  'AgreementUpdated', 'AgreementEnded',
  'WalkerAlertChanged', 'WalkerAlertFired',
] as const;

/** A step that brings some server-held state in line after a (re)connect. */
export type ResyncStep = (conn: HubConnection) => Promise<void>;
const resyncSteps: ResyncStep[] = [];

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

/** The part of the recorded state each command sends — what to send again when the
    server asked to slow down. (Watching routes is not settled this way.) */
const PART_OF: Record<string, string> = {
  SetRole: 'mode',
  MarkEngaged: 'band', MarkAvailable: 'band',
  PublishRoute: 'route', ClearRoute: 'route',
  StopSharing: 'sharing', UpdateLocation: 'sharing',
};
const unsettled = new Set<string>();
const settler = createBackoff(() => { settle(); });

/** The server refused `method` for now (rate_limited) and holds what it held before:
    send that part of the recorded state again a little later. */
function settleLater(method: string) {
  const part = PART_OF[method];
  if (!part) return;
  unsettled.add(part);
  settler.schedule();
}

/** Send the unsettled parts as they are recorded NOW (a newer choice wins over the
    refused one). Offline it waits: the next connect replays everything anyway. */
async function settle(): Promise<void> {
  const conn = hub.connected();
  if (!conn) return;
  const parts = new Set(unsettled);
  unsettled.clear();
  for (const [method, ...args] of desired.replay()) {
    if (!parts.has(PART_OF[method])) continue;
    try {
      await conn.invoke(method, ...args);
    } catch (e) {
      if (isRateLimited(e)) settleLater(method);
    }
  }
  if (!unsettled.size) settler.reset();
}

/** A fresh connection: forget the positions we were shown (the server re-seeds
    them via Walkers once the role is replayed) and rebuild our own state. */
async function resync(conn: HubConnection): Promise<void> {
  positions.clear();
  unsettled.clear(); // the whole state goes out now
  settler.reset();
  for (const [method, ...args] of desired.replay()) {
    try {
      await conn.invoke(method, ...args);
    } catch (e) {
      if (conn.state !== 'Connected') throw e; // lost again: the next connect replays it all
      // The server refused this one step (e.g. a stale route); replay the rest — and one
      // it only asked to slow down is sent again a little later.
      if (isRateLimited(e)) settleLater(method);
    }
  }
  for (const step of resyncSteps) {
    try {
      await step(conn);
    } catch (e) {
      if (conn.state !== 'Connected') throw e;
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

/** Sends a recorded command; one the server asks to slow down is settled later. */
const send = (method: string, ...args: unknown[]): Promise<void> =>
  invoke<void>(method, undefined, ...args).catch((e: unknown) => {
    if (isRateLimited(e)) settleLater(method);
    throw e;
  });

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
    return desired.mode ? send('SetRole', desired.mode) : Promise.resolve();
  },
  updateLocation(lat: number, lng: number, heading: number | null = null) {
    desired.located({ lat, lng, heading });
    return invoke('UpdateLocation', undefined, lat, lng, heading); // past its budget a fix is dropped: the next one supersedes it
  },
  stopSharing() {
    desired.stopSharing();
    return send('StopSharing');
  },
  publishRoute(routeDto: unknown) {
    desired.setRoute(routeDto);
    return send('PublishRoute', routeDto);
  },
  clearRoute() {
    desired.setRoute(null);
    return send('ClearRoute');
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
    return send('MarkEngaged');
  },
  /** Clear the engaged flag ("bo'sh"ga qaytish): discoverable again. */
  markAvailable() {
    desired.setEngaged(false);
    return send('MarkAvailable');
  },

  // --- session state (retained server-side across disconnects) ---------

  syncWalkerState: (delta: unknown) => invoke<unknown>('SyncWalkerState', null, delta),
  getWalkerState: () =>
    invoke<{ state?: Record<string, unknown>; activeTrip?: unknown } | null>('GetWalkerState', null),

  // --- extension point for services with server-held state of their own ---

  /** Run `step` after every (re)connect, once the presence state is replayed
      (and before the status turns 'connected'). Returns an unregister fn. */
  onResync(step: ResyncStep): () => void {
    resyncSteps.push(step);
    return () => { const i = resyncSteps.indexOf(step); if (i >= 0) resyncSteps.splice(i, 1); };
  },
  /** The connection while Connected, else null (for callers that must know a
      command really went out — e.g. an outbox). */
  connection: (): HubConnection | null => hub.connected(),
};
