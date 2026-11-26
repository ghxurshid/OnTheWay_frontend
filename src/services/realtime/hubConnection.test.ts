import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HubConnection } from '@microsoft/signalr';
import { createHubClient } from './hubConnection';
import type { HubStatus } from './hubConnection';

/** Just enough of a HubConnection to drive the client's lifecycle. */
class FakeConnection {
  state = 'Disconnected';
  failNextStarts = 0;
  starts = 0;
  private closeHandlers: ((e?: Error) => void)[] = [];
  onclose(fn: (e?: Error) => void) { this.closeHandlers.push(fn); }
  on() { /* server→client handlers are not exercised here */ }
  async start() {
    this.starts += 1;
    if (this.failNextStarts > 0) { this.failNextStarts -= 1; throw new Error('server unreachable'); }
    this.state = 'Connected';
  }
  async stop() { this.state = 'Disconnected'; this.closeHandlers.forEach((fn) => fn()); }
  /** The network dropped the socket. */
  drop() { this.state = 'Disconnected'; this.closeHandlers.forEach((fn) => fn(new Error('lost'))); }
}

function setup() {
  const fake = new FakeConnection();
  const replayedWhile: HubStatus[] = [];
  const onConnected = vi.fn(async () => { replayedWhile.push(client.status()); });
  const client = createHubClient('/hubs/test', () => {}, {
    onConnected,
    build: () => fake as unknown as HubConnection,
  });
  const reconnected = vi.fn();
  client.onReconnected(reconnected);
  const statuses: HubStatus[] = [];
  client.onStatus((s) => statuses.push(s));
  return { fake, client, onConnected, reconnected, statuses, replayedWhile };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('hub client — staying in sync across connection loss', () => {
  it('replays its state on the first connect before reporting "connected"', async () => {
    const { client, onConnected, reconnected, replayedWhile } = setup();

    await client.connect();

    expect(onConnected).toHaveBeenCalledTimes(1);
    expect(replayedWhile).toEqual(['connecting']); // the app is told only once the server is in step
    expect(client.status()).toBe('connected');
    expect(reconnected).not.toHaveBeenCalled();
  });

  it('reconnects at once after a drop, replays again, then announces the reconnect', async () => {
    const { fake, client, onConnected, reconnected, statuses } = setup();
    await client.connect();

    fake.drop();
    expect(client.status()).toBe('reconnecting');
    await flush();

    expect(fake.starts).toBe(2);
    expect(onConnected).toHaveBeenCalledTimes(2);
    expect(reconnected).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual(['connecting', 'connected', 'reconnecting', 'connected']);
  });

  it('backs off after failures but retries immediately when the device is back online', async () => {
    const { fake, client, onConnected } = setup();
    await client.connect();
    fake.failNextStarts = 2;

    fake.drop();
    await flush(); // immediate attempt fails → next one in 2 s
    expect(fake.starts).toBe(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fake.starts).toBe(2);

    window.dispatchEvent(new Event('online'));
    await flush(); // fails once more, backoff grows
    expect(fake.starts).toBe(3);

    window.dispatchEvent(new Event('online'));
    await flush();
    expect(fake.starts).toBe(4);
    expect(client.status()).toBe('connected');
    expect(onConnected).toHaveBeenCalledTimes(2);
  });

  it('a connection that keeps dropping right after connecting backs off instead of looping', async () => {
    const { fake, client } = setup();
    await client.connect();

    fake.drop();
    await flush(); // the first drop reconnects at once
    expect(fake.starts).toBe(2);

    fake.drop(); // dropped again straight away (e.g. the server refuses the replay)
    await flush();
    expect(fake.starts).toBe(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fake.starts).toBe(3);

    fake.drop();
    await vi.advanceTimersByTimeAsync(4000);
    expect(fake.starts).toBe(3); // 5 s now
    await vi.advanceTimersByTimeAsync(1000);
    expect(fake.starts).toBe(4);
    expect(client.status()).toBe('connected');
  });

  it('a connection the server closes during the replay backs off instead of looping', async () => {
    const fake = new FakeConnection();
    let refuseReplay = false;
    const client = createHubClient('/hubs/test', () => {}, {
      // The server closes the socket over something the replay sends (e.g. an oversized route).
      onConnected: async () => { if (refuseReplay) fake.drop(); },
      build: () => fake as unknown as HubConnection,
    });
    await client.connect();
    refuseReplay = true;

    fake.drop();
    await flush(); // reconnects at once; the replay closes it again
    expect(fake.starts).toBe(2);
    expect(client.status()).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(1999);
    expect(fake.starts).toBe(2); // no tight loop: the next try waits 2 s
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.starts).toBe(3);
    await vi.advanceTimersByTimeAsync(4999);
    expect(fake.starts).toBe(3); // then 5 s
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.starts).toBe(4);
  });

  it('a connection that stayed up resets the backoff', async () => {
    const { fake, client } = setup();
    await client.connect();
    fake.drop();
    await flush();
    fake.drop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fake.starts).toBe(3);

    await vi.advanceTimersByTimeAsync(10_000); // up and healthy for a while
    fake.drop();
    await flush();
    expect(fake.starts).toBe(4);
  });

  it('a first connect that failed counts as a recovery once it succeeds', async () => {
    const { fake, client, reconnected } = setup();
    fake.failNextStarts = 1;

    await expect(client.connect()).rejects.toThrow();
    expect(client.status()).toBe('disconnected');
    await vi.advanceTimersByTimeAsync(2000);

    expect(client.status()).toBe('connected');
    expect(reconnected).toHaveBeenCalledTimes(1);
  });

  it('stays down after an explicit disconnect', async () => {
    const { fake, client } = setup();
    await client.connect();

    await client.disconnect();
    await vi.advanceTimersByTimeAsync(60_000);
    window.dispatchEvent(new Event('online'));
    await flush();

    expect(fake.starts).toBe(1);
    expect(client.status()).toBe('disconnected');
  });

  it('whenConnected waits for a slow first connect, and gives up after its timeout', async () => {
    const { fake, client } = setup();
    fake.failNextStarts = 1;
    await client.connect().catch(() => {});

    const waited = client.whenConnected(5000);
    await vi.advanceTimersByTimeAsync(2000); // the retry succeeds
    await expect(waited).resolves.toBe(true);

    await client.disconnect();
    const never = client.whenConnected(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(never).resolves.toBe(false);
  });

  it('a replay step that throws does not wedge the connection', async () => {
    const fake = new FakeConnection();
    const client = createHubClient('/hubs/test', () => {}, {
      onConnected: async () => { throw new Error('refused'); },
      build: () => fake as unknown as HubConnection,
    });

    await client.connect();

    expect(client.status()).toBe('connected');
  });
});
