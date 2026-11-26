import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ApiError } from '@/api/client';

const hub = vi.hoisted(() => ({ sendMessage: vi.fn(), onReconnected: vi.fn() }));
const rest = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@/services/realtime/chatClient', () => ({ chatClient: hub }));
vi.mock('@/api/chatApi', () => ({ chatApi: rest }));

// Errors come from the same (fresh) module graph as the outbox, or instanceof fails.
let Api: typeof ApiError;
const offline = () => new Api(0, 'Network request failed.', [], 'network');
const saved = (clientMessageId: string) => ({ id: '42', senderId: '1', content: 'Salom', clientMessageId });
/** Lets every pending promise callback run (the timers are fake). */
const tick = () => vi.advanceTimersByTimeAsync(0);
const rateLimited = new Error("An unexpected error occurred invoking 'SendMessageWithId' on the server. HubException: rate_limited");
const notConnected = () => new Error('Chat hub not connected');

async function loadModule() {
  vi.resetModules();
  Api = (await import('@/api/client')).ApiError;
  return import('./chatOutbox');
}
const load = async () => (await loadModule()).chatOutbox;

// Fake timers throughout: the outbox retries on timers of its own, and a module left
// behind by one test must never fire into the next (switching back discards them).
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  hub.sendMessage.mockReset();
  rest.send.mockReset();
});
afterEach(() => { vi.useRealTimers(); });

describe('chat outbox', () => {
  it('sends over the socket and reports the stored message', async () => {
    hub.sendMessage.mockImplementation(async (_to, _text, id) => saved(id));
    const outbox = await load();
    const settled = vi.fn();
    outbox.on('settled', settled);

    const item = outbox.send('7', 'Salom');
    await tick();

    expect(hub.sendMessage).toHaveBeenCalledWith('7', 'Salom', item.clientId);
    expect(settled).toHaveBeenCalledWith(item, saved(item.clientId));
    expect(outbox.pendingFor('7')).toEqual([]);
  });

  it('falls back to REST with the SAME id, so a lost socket answer cannot double the message', async () => {
    hub.sendMessage.mockRejectedValue(new Error('Invocation canceled: connection closed'));
    rest.send.mockImplementation(async (_to, _text, id) => saved(id));
    const outbox = await load();

    const item = outbox.send('7', 'Salom');
    await tick();

    expect(rest.send).toHaveBeenCalledWith('7', 'Salom', item.clientId);
    expect(outbox.pendingFor('7')).toEqual([]);
  });

  it('keeps a message written offline — even across a restart — and sends it once when back', async () => {
    let outbox = await load();
    hub.sendMessage.mockRejectedValue(notConnected());
    rest.send.mockRejectedValue(offline());
    const item = outbox.send('7', 'Yo`ldaman');
    await tick();
    expect(outbox.pendingFor('7')).toMatchObject([{ clientId: item.clientId, text: 'Yo`ldaman' }]);

    outbox = await load(); // chat closed, app reopened
    hub.sendMessage.mockImplementation(async (_to, _text, id) => saved(id));
    await outbox.flush();

    expect(hub.sendMessage).toHaveBeenLastCalledWith('7', 'Yo`ldaman', item.clientId);
    expect(outbox.pendingFor('7')).toEqual([]);
  });

  it('a refusal is shown as failed and can be resent under the same id', async () => {
    hub.sendMessage.mockRejectedValue(notConnected());
    const outbox = await load();
    rest.send.mockRejectedValueOnce(new Api(400, 'Validation failed'));
    const failed = vi.fn();
    outbox.on('failed', failed);

    const item = outbox.send('7', 'Salom');
    await tick();
    expect(failed).toHaveBeenCalledWith(item, expect.objectContaining({ status: 400 }));
    await outbox.flush(); // refused messages wait for the user's "resend"
    expect(rest.send).toHaveBeenCalledTimes(1);

    rest.send.mockImplementation(async (_to, _text, id) => saved(id));
    outbox.retry(item.clientId);
    await tick();
    expect(rest.send).toHaveBeenLastCalledWith('7', 'Salom', item.clientId);
    expect(outbox.pendingFor('7')).toEqual([]);
  });

  it('a conflict is retried once under the same id, and the retry gets the stored message', async () => {
    hub.sendMessage.mockRejectedValue(notConnected());
    const outbox = await load();
    rest.send.mockRejectedValueOnce(new Api(409, 'This item already exists. Please retry.'));
    rest.send.mockImplementation(async (_to, _text, id) => saved(id));
    const settled = vi.fn();
    outbox.on('settled', settled);

    const item = outbox.send('7', 'Salom');
    await tick();

    expect(rest.send).toHaveBeenCalledTimes(2);
    expect(rest.send).toHaveBeenLastCalledWith('7', 'Salom', item.clientId);
    expect(settled).toHaveBeenCalledWith(item, saved(item.clientId));
    expect(outbox.pendingFor('7')).toEqual([]);
  });

  it('a conflict that repeats is a refusal (e.g. a deactivated account): failed, never shown as sent', async () => {
    hub.sendMessage.mockRejectedValue(notConnected());
    const outbox = await load();
    rest.send.mockRejectedValue(new Api(409, 'You cannot message a deactivated account.'));
    const settled = vi.fn();
    const failed = vi.fn();
    outbox.on('settled', settled);
    outbox.on('failed', failed);

    const item = outbox.send('7', 'Salom');
    await tick();

    expect(settled).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledWith(item, expect.objectContaining({ status: 409 }));
    expect(outbox.pendingFor('7')).toMatchObject([{ clientId: item.clientId, failed: true }]);
  });

  it('a send across a block fails at once with the reason — no REST retry, no auto-resend', async () => {
    const blocked = new Error("An unexpected error occurred invoking 'SendMessageWithId' on the server. HubException: user_blocked");
    hub.sendMessage.mockRejectedValue(blocked);
    const outbox = await load();
    const failed = vi.fn();
    outbox.on('failed', failed);

    const item = outbox.send('7', 'Salom');
    await tick();
    await outbox.flush();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(failed).toHaveBeenCalledWith(item, blocked);
    expect(rest.send).not.toHaveBeenCalled();
    expect(hub.sendMessage).toHaveBeenCalledTimes(1);
    expect(outbox.pendingFor('7')).toMatchObject([{ clientId: item.clientId, failed: true }]);
  });

  it('a socket asked to slow down hands the message to REST under the same id', async () => {
    hub.sendMessage.mockRejectedValue(rateLimited);
    rest.send.mockImplementation(async (_to, _text, id) => saved(id));
    const outbox = await load();
    const failed = vi.fn();
    outbox.on('failed', failed);

    const item = outbox.send('7', 'Salom');
    await tick();

    expect(rest.send).toHaveBeenCalledWith('7', 'Salom', item.clientId);
    expect(failed).not.toHaveBeenCalled();
    expect(outbox.pendingFor('7')).toEqual([]);
  });

  it('asked to slow down by both is no failure: sending pauses, keeps the order and picks up later', async () => {
    hub.sendMessage.mockRejectedValue(rateLimited);
    const outbox = await load();
    rest.send.mockRejectedValueOnce(new Api(429, 'Too many requests. Please slow down.'));
    rest.send.mockImplementation(async (_to, _text, id) => saved(id));
    const failed = vi.fn();
    const settled = vi.fn();
    outbox.on('failed', failed);
    outbox.on('settled', settled);

    const first = outbox.send('7', 'Birinchi');
    await tick();
    const second = outbox.send('7', 'Ikkinchi'); // written during the pause: waits its turn
    await outbox.flush(); // e.g. the connection came back meanwhile: still paused

    expect(failed).not.toHaveBeenCalled();
    expect(rest.send).toHaveBeenCalledTimes(1);
    expect(outbox.pendingFor('7')).toEqual([
      expect.objectContaining({ clientId: first.clientId }),
      expect.objectContaining({ clientId: second.clientId }),
    ]);
    expect(outbox.pendingFor('7').some((i) => i.failed)).toBe(false);

    await vi.advanceTimersByTimeAsync(10_000);

    expect(rest.send.mock.calls.slice(1).map((call) => call[1])).toEqual(['Birinchi', 'Ikkinchi']);
    expect(settled).toHaveBeenCalledTimes(2);
    expect(failed).not.toHaveBeenCalled();
    expect(outbox.pendingFor('7')).toEqual([]);
  });
});

describe('chat outbox — one conversation, one message at a time, in the order written', () => {
  it('a burst the socket refuses goes over REST one message at a time, in order (E2E S7)', async () => {
    // The server's copy of the thread, in the order it stored the messages.
    const stored: string[] = [];
    const store = (text: string, id: string) => { stored.push(text); return saved(id); };
    // The socket takes a burst of 20, then refuses until its budget refills 10 s on.
    let socketBudget = 20;
    setTimeout(() => { socketBudget = 20; }, 10_000);
    hub.sendMessage.mockImplementation(async (_to, text: string, id: string) => {
      if (socketBudget <= 0) throw rateLimited;
      socketBudget -= 1;
      return store(text, id);
    });
    // REST answers after a round trip: first a racing write (409), then "slow down" (429).
    let inFlight = 0;
    let mostInFlight = 0;
    let restCalls = 0;
    rest.send.mockImplementation(async (_to, text: string, id: string) => {
      inFlight += 1;
      mostInFlight = Math.max(mostInFlight, inFlight);
      try {
        await new Promise((resolve) => { setTimeout(resolve, 200); });
        restCalls += 1;
        if (restCalls === 1) throw new Api(409, 'This item already exists. Please retry.');
        if (restCalls === 2) throw new Api(429, 'Too many requests. Please slow down.');
        return store(text, id);
      } finally {
        inFlight -= 1;
      }
    });
    const outbox = await load();
    const failed = vi.fn();
    outbox.on('failed', failed);

    const written = Array.from({ length: 30 }, (_, i) => `burst ${i + 1}`);
    for (const text of written) {
      outbox.send('7', text);
      await vi.advanceTimersByTimeAsync(100); // typed as fast as possible
    }
    await vi.advanceTimersByTimeAsync(120_000);

    expect(stored).toEqual(written);
    expect(mostInFlight).toBe(1);
    expect(failed).not.toHaveBeenCalled();
    expect(outbox.pendingFor('7')).toEqual([]);
  });

  it('a message written during a cut is not overtaken once REST works but the socket is not back (E2E S8)', async () => {
    const stored: string[] = [];
    hub.sendMessage.mockRejectedValue(notConnected()); // the chat socket stays down throughout
    let reachable = false;
    rest.send.mockImplementation(async (_to, text: string, id: string) => {
      if (!reachable) throw offline();
      stored.push(text);
      return saved(id);
    });
    const outbox = await load();

    const cut = outbox.send('7', 'written while cut');
    await tick();
    expect(outbox.pendingFor('7')).toMatchObject([{ clientId: cut.clientId }]);
    expect(outbox.pendingFor('7')[0].failed).toBeFalsy();

    reachable = true; // the network is back, before the retry is due
    await vi.advanceTimersByTimeAsync(1_500);
    const after1 = outbox.send('7', 'after the cut 1');
    const after2 = outbox.send('7', 'after the cut 2');
    await tick();

    expect(stored).toEqual(['written while cut', 'after the cut 1', 'after the cut 2']);
    // The same id on every attempt of a message.
    expect(rest.send.mock.calls.map((call) => call[2]))
      .toEqual([cut.clientId, cut.clientId, after1.clientId, after2.clientId]);
    expect(outbox.pendingFor('7')).toEqual([]);
  });

  it('a waiting message is tried again on a short backoff, not only on reconnect', async () => {
    const outbox = await load();
    hub.sendMessage.mockRejectedValue(notConnected());
    rest.send.mockRejectedValueOnce(offline());
    rest.send.mockRejectedValueOnce(offline());
    rest.send.mockImplementation(async (_to, _text, id) => saved(id));
    const settled = vi.fn();
    outbox.on('settled', settled);

    const item = outbox.send('7', 'Salom');
    await tick();
    await vi.advanceTimersByTimeAsync(2_000); // still unreachable: the next try waits longer
    expect(rest.send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(rest.send).toHaveBeenCalledTimes(3);
    expect(rest.send).toHaveBeenLastCalledWith('7', 'Salom', item.clientId);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(outbox.pendingFor('7')).toEqual([]);

    await vi.advanceTimersByTimeAsync(120_000); // through: nothing more is sent
    expect(rest.send).toHaveBeenCalledTimes(3);
  });

  it('a refused message never holds up the ones written after it', async () => {
    const outbox = await load();
    hub.sendMessage.mockRejectedValue(notConnected());
    rest.send.mockRejectedValueOnce(new Api(400, 'Validation failed'));
    rest.send.mockImplementation(async (_to, _text, id) => saved(id));
    const failed = vi.fn();
    const settled = vi.fn();
    outbox.on('failed', failed);
    outbox.on('settled', settled);

    const refused = outbox.send('7', 'A');
    const next = outbox.send('7', 'B');
    await tick();

    expect(failed).toHaveBeenCalledWith(refused, expect.objectContaining({ status: 400 }));
    expect(settled).toHaveBeenCalledWith(next, saved(next.clientId));
    expect(outbox.pendingFor('7')).toMatchObject([{ clientId: refused.clientId, failed: true }]);
  });

  it('the slow-down pause holds every conversation, and each goes on in order', async () => {
    const outbox = await load();
    hub.sendMessage.mockRejectedValue(rateLimited);
    rest.send.mockRejectedValueOnce(new Api(429, 'Too many requests. Please slow down.'));
    rest.send.mockImplementation(async (_to, _text, id) => saved(id));

    outbox.send('7', 'to seven');
    await tick();
    outbox.send('8', 'to eight'); // another chat: the budget is the user's, so it waits too
    outbox.send('7', 'to seven again');
    await tick();
    expect(rest.send).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);

    const sent = rest.send.mock.calls.slice(1).map((call) => `${call[0]}:${call[1]}`);
    expect(sent.filter((s) => s.startsWith('7:'))).toEqual(['7:to seven', '7:to seven again']);
    expect(sent).toContain('8:to eight');
    expect(outbox.pendingFor('7')).toEqual([]);
    expect(outbox.pendingFor('8')).toEqual([]);
  });

  it('a queue left over from the last session drains in order, one message at a time', async () => {
    localStorage.setItem('ontheway_chat_outbox_v1', JSON.stringify([
      { clientId: 'c1', toUserId: '7', text: 'one', at: 1 },
      { clientId: 'c2', toUserId: '7', text: 'two', at: 2 },
      { clientId: 'c3', toUserId: '8', text: 'other chat', at: 3 },
      { clientId: 'c4', toUserId: '7', text: 'three', at: 4 },
    ]));
    const order: string[] = [];
    let inFlight = 0;
    let mostInFlight = 0;
    hub.sendMessage.mockImplementation(async (to: string, text: string, id: string) => {
      if (to === '7') { inFlight += 1; mostInFlight = Math.max(mostInFlight, inFlight); }
      await new Promise((resolve) => { setTimeout(resolve, 50); });
      if (to === '7') inFlight -= 1;
      order.push(`${to}:${text}`);
      return saved(id);
    });
    const outbox = await load();

    const flushed = outbox.flush();
    await vi.advanceTimersByTimeAsync(1_000);
    await flushed;

    expect(order.filter((s) => s.startsWith('7:'))).toEqual(['7:one', '7:two', '7:three']);
    expect(order).toContain('8:other chat');
    expect(mostInFlight).toBe(1);
    expect(hub.sendMessage.mock.calls.map((call) => call[2]).sort()).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(outbox.pendingFor('7')).toEqual([]);
  });

  it('a socket that does not answer hands the message to REST under the same id, and the rest follow', async () => {
    const { chatOutbox: outbox, SOCKET_ANSWER_MS } = await loadModule();
    hub.sendMessage.mockImplementation(() => new Promise(() => {})); // half-open: no answer, no close
    rest.send.mockImplementation(async (_to, _text, id) => saved(id));

    const first = outbox.send('7', 'A');
    const second = outbox.send('7', 'B');
    await vi.advanceTimersByTimeAsync(SOCKET_ANSWER_MS - 1);
    expect(rest.send).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(rest.send).toHaveBeenCalledWith('7', 'A', first.clientId);
    expect(rest.send).toHaveBeenCalledTimes(1); // B waits for A

    await vi.advanceTimersByTimeAsync(SOCKET_ANSWER_MS);
    expect(rest.send).toHaveBeenLastCalledWith('7', 'B', second.clientId);
    expect(outbox.pendingFor('7')).toEqual([]);
  });

  it('a reconnect sends what waited', async () => {
    const outbox = await load();
    hub.sendMessage.mockRejectedValue(notConnected());
    rest.send.mockRejectedValue(offline());
    const onReconnected = hub.onReconnected.mock.calls.at(-1)![0] as () => void;

    const item = outbox.send('7', 'Salom');
    await tick();
    hub.sendMessage.mockImplementation(async (_to, _text, id) => saved(id));
    onReconnected();
    await tick();

    expect(hub.sendMessage).toHaveBeenLastCalledWith('7', 'Salom', item.clientId);
    expect(outbox.pendingFor('7')).toEqual([]);
  });
});
