/* ════════════════════════════════════════════════════════════════
   SIGNALR — shared connection factory + client plumbing.
   Builds a HubConnection that authenticates with the same JWT the REST
   client uses (the backend's JwtBearer handler reads it from the
   `access_token` query string for /hubs/* paths) and reconnects on drop.
   `createHubClient` / `createEmitter` hold the lifecycle and listener
   bookkeeping every hub client (presence, chat, call) shares.
   ════════════════════════════════════════════════════════════════ */

import { HubConnectionBuilder, HttpTransportType, LogLevel } from '@microsoft/signalr';
import type { HubConnection } from '@microsoft/signalr';
import { authStore } from '@/services/authStore';

const env = import.meta.env || {};
const HUB_BASE = (env.VITE_HUB_BASE_URL || '').replace(/\/$/, '');

/** Create (but do not start) a hub connection for the given hub path. */
export function createHubConnection(path: string): HubConnection {
  return new HubConnectionBuilder()
    .withUrl(`${HUB_BASE}${path}`, {
      accessTokenFactory: () => authStore.getAccessToken() || '',
      // WebSockets first; SignalR falls back automatically if unavailable.
      transport: HttpTransportType.WebSockets | HttpTransportType.LongPolling,
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000])
    .configureLogging(import.meta.env?.DEV ? LogLevel.Warning : LogLevel.Error)
    .build();
}

/** Start a connection, swallowing the "already started" race during reconnects. */
export async function startConnection(connection: HubConnection | null): Promise<void> {
  if (!connection) return;
  try {
    if (connection.state === 'Disconnected') await connection.start();
  } catch (err) {
    if (import.meta.env?.DEV) console.warn('[signalr] start failed:', (err as Error)?.message || err);
    throw err;
  }
}

// Server payloads are untyped at this boundary; subscribers narrow them.
export type Handler = (...args: any[]) => void;

/** A tiny event bus. `on` returns an unsubscribe; a throwing handler is logged,
    never allowed to break the other subscribers. */
export function createEmitter(tag: string) {
  const listeners = new Map<string, Set<Handler>>();
  return {
    on(event: string, handler: Handler): () => void {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return () => { listeners.get(event)?.delete(handler); };
    },
    emit(event: string, ...args: unknown[]): void {
      listeners.get(event)?.forEach((fn) => {
        try { fn(...args); } catch (e) { console.error(`[${tag}] ${event} handler`, e); }
      });
    },
  };
}

/** A lazily-built singleton hub connection; `configure` wires its server→client
    handlers once, when the connection is first created. */
export function createHubClient(path: string, configure: (connection: HubConnection) => void) {
  let connection: HubConnection | null = null;

  const get = (): HubConnection => {
    if (!connection) {
      connection = createHubConnection(path);
      configure(connection);
    }
    return connection;
  };

  return {
    /** The current connection in any state (null before first use). */
    current: (): HubConnection | null => connection,
    /** The connection only while Connected — invocations elsewhere become no-ops. */
    connected: (): HubConnection | null => (connection?.state === 'Connected' ? connection : null),
    isConnected: (): boolean => connection?.state === 'Connected',
    connect: (): Promise<void> => startConnection(get()),
    async disconnect(): Promise<void> {
      if (connection) { try { await connection.stop(); } catch { /* ignore */ } }
      connection = null;
    },
  };
}
