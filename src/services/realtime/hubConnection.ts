/* ════════════════════════════════════════════════════════════════
   SIGNALR — shared connection factory + client plumbing.
   Builds a HubConnection that authenticates with the same JWT the REST
   client uses (the backend's JwtBearer handler reads it from the
   `access_token` query string for /hubs/* paths). The token is renewed
   before a (re)connect when it has expired, reconnection never gives up,
   and a connection that closed anyway is restarted with backoff — so a
   network blip on the road never leaves presence/chat/calls silently dead.
   `createHubClient` / `createEmitter` hold the lifecycle and listener
   bookkeeping every hub client (presence, chat, call) shares.
   ════════════════════════════════════════════════════════════════ */

import { HubConnectionBuilder, HttpTransportType, LogLevel } from '@microsoft/signalr';
import type { HubConnection } from '@microsoft/signalr';
import { authStore } from '@/services/authStore';

const env = import.meta.env || {};
const HUB_BASE = (env.VITE_HUB_BASE_URL || '').replace(/\/$/, '');

/** Reconnect/restart delays (ms); the last one repeats forever (with jitter). */
const RETRY_DELAYS = [0, 2000, 5000, 10000, 20000];
const retryDelay = (attempt: number): number =>
  (RETRY_DELAYS[attempt] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1]) + (attempt >= RETRY_DELAYS.length ? Math.random() * 5000 : 0);

/** A fresh access token for the (re)connect handshake. */
async function accessToken(): Promise<string> {
  if (authStore.isAccessTokenExpired()) {
    try { await authStore.refresh(); } catch { /* the handshake 401 surfaces as a failed start */ }
  }
  return authStore.getAccessToken() || '';
}

/** Create (but do not start) a hub connection for the given hub path. */
export function createHubConnection(path: string): HubConnection {
  return new HubConnectionBuilder()
    .withUrl(`${HUB_BASE}${path}`, {
      accessTokenFactory: accessToken,
      // WebSockets first; SignalR falls back automatically if unavailable.
      transport: HttpTransportType.WebSockets | HttpTransportType.LongPolling,
    })
    .withAutomaticReconnect({ nextRetryDelayInMilliseconds: (ctx) => retryDelay(ctx.previousRetryCount) })
    .configureLogging(import.meta.env?.DEV ? LogLevel.Warning : LogLevel.Error)
    .build();
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

/** Connection health as the UI shows it. */
export type HubStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

/** A lazily-built singleton hub connection; `configure` wires its server→client
    handlers once, when the connection is first created. */
export function createHubClient(path: string, configure: (connection: HubConnection) => void) {
  let connection: HubConnection | null = null;
  let wanted = false;         // connect() called and not disconnected since
  let attempt = 0;            // consecutive failed restarts
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let status: HubStatus = 'disconnected';
  const events = createEmitter(path);

  const setStatus = (next: HubStatus) => {
    if (next === status) return;
    status = next;
    events.emit('status', next);
  };

  const start = async (): Promise<void> => {
    const c = get();
    if (c.state !== 'Disconnected') return;
    setStatus('connecting');
    try {
      await c.start();
      const restarted = attempt > 0;
      attempt = 0;
      setStatus('connected');
      if (restarted) events.emit('reconnected');
    } catch (err) {
      setStatus('disconnected');
      if (import.meta.env?.DEV) console.warn(`[signalr] ${path} start failed:`, (err as Error)?.message || err);
      scheduleRestart();
      throw err;
    }
  };

  const scheduleRestart = () => {
    if (!wanted || restartTimer) return;
    restartTimer = setTimeout(() => {
      restartTimer = null;
      attempt += 1;
      start().catch(() => { /* rescheduled inside start */ });
    }, retryDelay(attempt + 1));
  };

  const get = (): HubConnection => {
    if (!connection) {
      connection = createHubConnection(path);
      connection.onreconnecting(() => setStatus('reconnecting'));
      connection.onreconnected(() => { setStatus('connected'); events.emit('reconnected'); });
      connection.onclose(() => { setStatus('disconnected'); scheduleRestart(); });
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
    status: (): HubStatus => status,
    /** Subscribe to status changes. Returns an unsubscribe. */
    onStatus: (fn: (s: HubStatus) => void) => events.on('status', fn),
    /** Fires after the connection came back (automatic reconnect or restart). */
    onReconnected: (fn: () => void) => events.on('reconnected', fn),
    connect: (): Promise<void> => { wanted = true; return start(); },
    async disconnect(): Promise<void> {
      wanted = false;
      if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
      if (connection) { try { await connection.stop(); } catch { /* ignore */ } }
      connection = null;
      setStatus('disconnected');
    },
  };
}
