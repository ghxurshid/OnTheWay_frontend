/* ════════════════════════════════════════════════════════════════
   SIGNALR — shared connection factory + client plumbing.
   Builds a HubConnection that authenticates with the same JWT the REST
   client uses (the backend's JwtBearer handler reads it from the
   `access_token` query string for /hubs/* paths). The token is renewed
   before a (re)connect when it has expired.

   Staying in sync across connection loss (the rules every hub client
   shares, see createHubClient):
   • A blip of a moment is absorbed by SignalR's stateful reconnect — the
     same connection resumes and messages sent meanwhile are replayed.
   • Anything longer is a NEW connection to the server: its groups are gone
     and whatever we invoked while offline never arrived. So after EVERY
     successful connect the client's `onConnected` re-sends its state
     (idempotently), before the app is told it is live again.
   • Reconnecting never gives up (backoff with jitter), and it retries at
     once when the device comes back online or the app returns to the
     foreground, instead of sleeping out the backoff.
   ════════════════════════════════════════════════════════════════ */

import { HubConnectionBuilder, HttpTransportType, LogLevel } from '@microsoft/signalr';
import type { HubConnection } from '@microsoft/signalr';
import { authStore } from '@/services/authStore';
import { onAppForeground } from '@/services/telegram';

const env = import.meta.env || {};
const HUB_BASE = (env.VITE_HUB_BASE_URL || '').replace(/\/$/, '');

/** Reconnect delays (ms) after consecutive failures; the last one repeats forever (with jitter). */
const RETRY_DELAYS = [0, 2000, 5000, 10000, 20000];
export const retryDelay = (attempt: number): number =>
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
    // A dropped WebSocket first tries to resume the same connection (server:
    // AllowStatefulReconnects). Reconnecting after that is createHubClient's job.
    .withStatefulReconnect()
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

export interface HubClientOptions {
  /** Runs after every successful (re)connect, before the status turns
      'connected': re-send whatever state the server must hold for this client. */
  onConnected?: (connection: HubConnection) => Promise<void> | void;
  /** Connection factory (tests inject a fake). */
  build?: (path: string) => HubConnection;
}

/** A lazily-built singleton hub connection; `configure` wires its server→client
    handlers once, when the connection is first created (before it starts, so
    nothing sent on connect is missed). */
export function createHubClient(path: string, configure: (connection: HubConnection) => void,
  { onConnected, build = createHubConnection }: HubClientOptions = {}) {
  let connection: HubConnection | null = null;
  let wanted = false;         // connect() called and not disconnected since
  let attempt = 0;            // consecutive failed starts
  let everConnected = false;  // a later connect is a REconnect (state to resync)
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
    const recovering = everConnected || attempt > 0;
    setStatus(everConnected ? 'reconnecting' : 'connecting');
    try {
      await c.start();
    } catch (err) {
      setStatus(everConnected ? 'reconnecting' : 'disconnected');
      if (import.meta.env?.DEV) console.warn(`[signalr] ${path} start failed:`, (err as Error)?.message || err);
      attempt += 1;
      scheduleRestart();
      throw err;
    }
    attempt = 0;
    everConnected = true;
    try {
      await onConnected?.(c);
    } catch (err) {
      // A failed replay step must not wedge the connection; the next reconnect retries it.
      if (import.meta.env?.DEV) console.warn(`[signalr] ${path} resync failed:`, (err as Error)?.message || err);
    }
    const stillUp = () => c.state === 'Connected'; // (a closure: the state changed while we awaited)
    if (!stillUp()) return; // dropped again during the replay — onclose took over
    setStatus('connected');
    if (recovering) events.emit('reconnected');
  };

  const scheduleRestart = () => {
    if (!wanted || restartTimer) return;
    restartTimer = setTimeout(() => {
      restartTimer = null;
      start().catch(() => { /* rescheduled inside start */ });
    }, retryDelay(attempt));
  };

  /** Retry now rather than at the end of the current backoff (back online / in view). */
  const nudge = () => {
    if (!wanted || !restartTimer || connection?.state !== 'Disconnected') return;
    clearTimeout(restartTimer);
    restartTimer = null;
    start().catch(() => { /* rescheduled inside start */ });
  };

  const get = (): HubConnection => {
    if (!connection) {
      const c = build(path);
      connection = c;
      c.onclose(() => {
        if (connection !== c) return; // an old, replaced connection
        if (!wanted) { setStatus('disconnected'); return; }
        setStatus('reconnecting');
        scheduleRestart();
      });
      configure(c);
    }
    return connection;
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', nudge);
    onAppForeground(nudge);
  }

  return {
    /** The current connection in any state (null before first use). */
    current: (): HubConnection | null => connection,
    /** The connection only while Connected — invocations elsewhere become no-ops. */
    connected: (): HubConnection | null => (connection?.state === 'Connected' ? connection : null),
    isConnected: (): boolean => connection?.state === 'Connected',
    status: (): HubStatus => status,
    /** Subscribe to status changes. Returns an unsubscribe. */
    onStatus: (fn: (s: HubStatus) => void) => events.on('status', fn),
    /** Fires once the connection is back (and `onConnected` has resynced it) after
        a loss or a failed first attempt — time to refetch what was missed. */
    onReconnected: (fn: () => void) => events.on('reconnected', fn),
    connect: (): Promise<void> => { wanted = true; return start(); },
    /** Resolves true once connected (and resynced), false after `timeoutMs`. */
    whenConnected(timeoutMs: number): Promise<boolean> {
      if (status === 'connected') return Promise.resolve(true);
      return new Promise((resolve) => {
        const off = events.on('status', (s) => { if (s === 'connected') { clearTimeout(timer); off(); resolve(true); } });
        const timer = setTimeout(() => { off(); resolve(false); }, timeoutMs);
      });
    },
    /** Try to reconnect right away (e.g. the network just came back). */
    nudge,
    async disconnect(): Promise<void> {
      wanted = false;
      if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
      const c = connection;
      connection = null;
      everConnected = false;
      attempt = 0;
      if (c) { try { await c.stop(); } catch { /* ignore */ } }
      setStatus('disconnected');
    },
  };
}
