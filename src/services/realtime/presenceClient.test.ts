import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HubConnection } from '@microsoft/signalr';

// The hub client is replaced so the test can run the replay (onConnected) on a fake connection,
// and choose whether commands find a connection (`hub.conn`) or are only recorded (null).
const hub = vi.hoisted(() => ({
  onConnected: null as null | ((c: HubConnection) => Promise<void>),
  conn: null as null | HubConnection,
}));
vi.mock('./hubConnection', () => ({
  createEmitter: () => ({ on: () => () => {}, emit: () => {} }),
  createHubClient: (_path: string, _configure: unknown, options: { onConnected: (c: HubConnection) => Promise<void> }) => {
    hub.onConnected = options.onConnected;
    return {
      connected: () => hub.conn,
      connect: vi.fn(), disconnect: vi.fn(), isConnected: () => !!hub.conn, whenConnected: vi.fn(),
      status: () => (hub.conn ? 'connected' : 'disconnected'), onStatus: vi.fn(), onReconnected: vi.fn(),
    };
  },
}));

/** A fresh presence client (its recorded state and pending retries start empty). */
async function load() {
  vi.resetModules();
  return (await import('./presenceClient')).presenceClient;
}

/** How @microsoft/signalr rejects an invocation the hub refused with HubException(code). */
const refused = (method: string, code: string) =>
  new Error(`An unexpected error occurred invoking '${method}' on the server. HubException: ${code}`);

/** A connected fake that records what it is sent; `refuse` names the code the server refuses a call with. */
function connection(refuse: (method: string) => string | null = () => null) {
  const sent: string[] = [];
  const conn = {
    state: 'Connected',
    invoke: vi.fn(async (method: string) => {
      sent.push(method);
      const code = refuse(method);
      if (code) throw refused(method, code);
    }),
  } as unknown as HubConnection;
  return { conn, sent };
}

beforeEach(() => { vi.useFakeTimers(); hub.conn = null; });
afterEach(() => { vi.useRealTimers(); });

describe('presence replay', () => {
  it('a step the server refuses — a route too long, a rate limit, a bad id — does not stop the rest', async () => {
    const presenceClient = await load();
    await presenceClient.setMode('driver');
    await presenceClient.publishRoute({ points: [] });
    await presenceClient.updateLocation(41.31, 69.24);
    await presenceClient.watchRoute('m1');
    const catchUp = vi.fn(async () => {});
    presenceClient.onResync(catchUp);

    const codes: Record<string, string> = { SetRole: 'rate_limited', PublishRoute: 'route_too_long', WatchRoute: 'invalid_walker_id' };
    const { conn, sent } = connection((method) => codes[method] ?? null);

    await hub.onConnected!(conn);

    expect(sent).toEqual(['SetRole', 'PublishRoute', 'UpdateLocation', 'WatchRoute']);
    expect(catchUp).toHaveBeenCalledWith(conn);
  });
});

describe('a command the server asks to slow down', () => {
  it('is sent again a little later — as the device wants it by then — and nothing else is', async () => {
    const presenceClient = await load();
    await presenceClient.setMode('driver'); // recorded while offline: not part of the retry
    let slowDown = true;
    const { conn, sent } = connection((method) => (slowDown && method.startsWith('Mark') ? 'rate_limited' : null));
    hub.conn = conn;

    await presenceClient.markEngaged().catch(() => {});
    await presenceClient.markAvailable().catch(() => {}); // changed their mind: refused as well
    slowDown = false;
    await vi.advanceTimersByTimeAsync(2_000);

    expect(sent).toEqual(['MarkEngaged', 'MarkAvailable', 'MarkAvailable']);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sent).toHaveLength(3); // settled: nothing more goes out
  });

  it('keeps trying further apart while still refused; a reconnect replays it with everything else', async () => {
    const presenceClient = await load();
    await presenceClient.setMode('driver');
    let slowDown = true;
    const { conn, sent } = connection((method) => (slowDown && method === 'ClearRoute' ? 'rate_limited' : null));
    hub.conn = conn;
    const clears = () => sent.filter((m) => m === 'ClearRoute').length;

    await presenceClient.clearRoute().catch(() => {});
    await vi.advanceTimersByTimeAsync(2_000);
    expect(clears()).toBe(2);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(clears()).toBe(2); // the next try is 5 s after the last
    await vi.advanceTimersByTimeAsync(1_000);
    expect(clears()).toBe(3);

    // Back on a new connection: the whole state goes out at once, the route part with it.
    slowDown = false;
    sent.length = 0;
    await hub.onConnected!(conn);
    expect(sent).toEqual(['SetRole', 'ClearRoute']);
    sent.length = 0;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sent).toEqual([]); // nothing left to settle
  });

  it('waits for the connection while offline, and never re-sends a refusal that is final', async () => {
    const presenceClient = await load();
    const { conn, sent } = connection((method) => (method === 'PublishRoute' ? 'route_too_long' : 'rate_limited'));
    hub.conn = conn;

    await presenceClient.stopSharing().catch(() => {}); // asked to slow down …
    hub.conn = null; // … and the socket drops before the retry
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sent).toEqual(['StopSharing']); // the next connect's replay sends it

    hub.conn = conn;
    await presenceClient.publishRoute({ points: [] }).catch(() => {});
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sent.filter((m) => m === 'PublishRoute')).toEqual(['PublishRoute']);
  });
});
