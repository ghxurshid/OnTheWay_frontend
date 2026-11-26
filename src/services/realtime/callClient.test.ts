import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';

type Handler = (...args: unknown[]) => unknown;

// The hub client is replaced by one fake, connected connection: the test plays the
// server by calling the handlers the call client registered on it.
const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  invoke: null as unknown as Mock,
}));

vi.mock('./hubConnection', () => {
  const listeners = new Map<string, Set<Handler>>();
  return {
    createEmitter: () => ({
      on(event: string, fn: Handler) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(fn);
        return () => { listeners.get(event)?.delete(fn); };
      },
      emit(event: string, ...args: unknown[]) { listeners.get(event)?.forEach((fn) => fn(...args)); },
    }),
    createHubClient: (_path: string, configure: (c: unknown) => void) => {
      h.invoke = vi.fn(async () => undefined);
      const conn = { state: 'Connected', invoke: h.invoke, on: (name: string, fn: Handler) => { h.handlers.set(name, fn); } };
      configure(conn);
      return {
        connected: () => conn, current: () => conn, isConnected: () => true,
        connect: vi.fn(), disconnect: vi.fn(async () => {}),
      };
    },
  };
});
vi.mock('@/api/callApi', () => ({ callApi: { iceServers: vi.fn(async () => ({ iceServers: [] })) } }));

const { callClient } = await import('./callClient');

/** The server sends `event` to this device. */
const server = (event: string, ...args: unknown[]) => h.handlers.get(event)!(...args);

/** How @microsoft/signalr rejects an invocation the hub refused with HubException(code). */
const refused = (method: string, code: string) =>
  new Error(`An unexpected error occurred invoking '${method}' on the server. HubException: ${code}`);

beforeEach(() => { vi.useFakeTimers(); h.invoke.mockReset(); });
// Whatever a test leaves behind — a call still on, a retry still pending — is finished here.
afterEach(async () => {
  h.invoke.mockReset();
  await callClient.hangup();
  await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
});

describe('call client — the in-call "ride together" handshake', () => {
  it('takes an offer or an answer only from the person on the other end of this call', async () => {
    server('IncomingCall', { callId: '7', fromUserId: '42' });
    const offers: unknown[] = [];
    const answers: unknown[] = [];
    const offOffers = callClient.on('rideOffer', (o: unknown) => offers.push(o));
    const offAnswers = callClient.on('rideOfferAnswered', (a: unknown) => answers.push(a));

    const expired: unknown[] = [];
    const offExpired = callClient.on('rideOfferExpired', (e: unknown) => expired.push(e));

    server('RideOfferAnswered', '7', '99', false); // someone else naming our call
    server('RideOffer', '7', '99');
    server('RideOfferExpired', '7', '99');
    server('RideOfferAnswered', '8', '42', true); // the peer, but another call
    server('RideOfferExpired', '8', '42');
    server('RideOfferAnswered', '7', '42', true);
    server('RideOffer', '7', 42); // the peer — ids compare as strings
    server('RideOfferExpired', '7', 42);

    offOffers(); offAnswers(); offExpired();
    expect(answers).toEqual([{ callId: '7', byUserId: '42', accepted: true }]);
    expect(offers).toEqual([{ callId: '7', fromUserId: 42 }]);
    expect(expired).toEqual([{ callId: '7', byUserId: 42 }]);
  });
});

describe('call client — ending a call when the server says slow down', () => {
  it('sends a decline the server asked to slow down again a little later, once', async () => {
    server('IncomingCall', { callId: '9', fromUserId: '42' });
    h.invoke.mockRejectedValueOnce(refused('RejectCall', 'rate_limited'));

    await callClient.rejectCall();
    expect(h.invoke).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(h.invoke).toHaveBeenCalledTimes(2);
    expect(h.invoke).toHaveBeenLastCalledWith('RejectCall', '9');

    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.invoke).toHaveBeenCalledTimes(2); // through: nothing left to send
  });

  it('keeps a hang-up queued while it is still refused for now, and drops one that is refused for good', async () => {
    server('IncomingCall', { callId: '11', fromUserId: '42' });
    h.invoke
      .mockRejectedValueOnce(refused('Hangup', 'rate_limited'))
      .mockRejectedValueOnce(refused('Hangup', 'rate_limited'));

    await callClient.hangup();
    await vi.advanceTimersByTimeAsync(2_000); // refused again: the next try waits longer
    expect(h.invoke).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(h.invoke).toHaveBeenCalledTimes(3);
    expect(h.invoke).toHaveBeenLastCalledWith('Hangup', '11');

    // A final refusal (the call is over on the server already) is not sent again.
    server('IncomingCall', { callId: '12', fromUserId: '42' });
    h.invoke.mockRejectedValueOnce(refused('Hangup', 'call_not_active'));
    await callClient.hangup();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.invoke).toHaveBeenCalledTimes(4);
  });
});
