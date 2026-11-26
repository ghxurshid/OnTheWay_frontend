import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { i18nStore, t } from '@/i18n';
import { AGREEMENT_EVENT, agreementStore, toAgreement } from '@/services/agreementStore';
import type { AgreementDto } from '@/services/agreementStore';
import { RIDE_OFFER_LIFETIME_MS, RIDE_OFFER_WAIT_MS } from '@/services/realtime/rideOffer';
import { appError } from '@/utils/errors';
import { useCallSession } from './useCallSession';

type Handler = (payload?: unknown) => void;

// The call client is a fake the test plays the server through.
const call = vi.hoisted(() => ({
  handlers: new Map<string, Set<(payload?: unknown) => void>>(),
  sendRideOffer: vi.fn(),
  respondRideOffer: vi.fn(),
  startCall: vi.fn(),
}));
vi.mock('@/services/realtime', () => ({
  callClient: {
    on: (event: string, fn: Handler) => {
      if (!call.handlers.has(event)) call.handlers.set(event, new Set());
      call.handlers.get(event)!.add(fn);
      return () => { call.handlers.get(event)?.delete(fn); };
    },
    sendRideOffer: call.sendRideOffer,
    respondRideOffer: call.respondRideOffer,
    startCall: call.startCall,
    hangup: vi.fn(async () => {}),
    rejectCall: vi.fn(async () => {}),
    acceptCall: vi.fn(async () => {}),
  },
  presenceClient: { isConnected: () => false, isOnline: () => true },
}));
const agreements = vi.hoisted(() => ({ whenAgreedWith: vi.fn(), agreedInCall: vi.fn() }));
vi.mock('@/services/agreementService', () => ({
  agreementService: { ...agreements, onPeerEvent: () => () => {} },
}));
const companions = vi.hoisted(() => ({ recordCompanion: vi.fn() }));
vi.mock('@/services/liveTripService', () => companions);
const contacts = vi.hoisted(() => ({ addContact: vi.fn() }));
vi.mock('@/services/contactService', () => contacts);
vi.mock('@/services/savedStore', () => ({ savedStore: { has: () => true, toggle: vi.fn() } }));
vi.mock('@/services/blockStore', () => ({ blockStore: { has: () => false } }));
vi.mock('@/services/telegram', () => ({ haptic: vi.fn() }));
vi.mock('@/utils/ringtone', () => ({ startRingtone: vi.fn(), stopRingtone: vi.fn() }));

/** agreementService.whenAgreedWith as it is: true once the store holds the server's agreement with
    the peer (at once if it does already), false after the bound. */
const AGREEMENT_WAIT_MS = 10_000;
function whenAgreedWith(peerId: string): Promise<boolean> {
  const has = () => agreementStore.serverAgreements().some((a) => a.peer.id === peerId);
  if (has()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (agreed: boolean) => {
      window.removeEventListener(AGREEMENT_EVENT, check);
      clearTimeout(timer);
      resolve(agreed);
    };
    const check = () => { if (has()) done(true); };
    const timer = setTimeout(() => done(false), AGREEMENT_WAIT_MS);
    window.addEventListener(AGREEMENT_EVENT, check);
  });
}

/** The server (or the peer) sends `event` to this device. */
const server = (event: string, payload?: unknown) => act(() => { call.handlers.get(event)?.forEach((fn) => fn(payload)); });
/** Several server events handled in one go (one long-polling response), before React renders. */
const serverBurst = (...events: [string, unknown][]) =>
  act(() => { events.forEach(([event, payload]) => call.handlers.get(event)?.forEach((fn) => fn(payload))); });
/** How @microsoft/signalr rejects an invocation the hub refused with HubException(code). */
const refused = (code: string, method = 'RespondRideOffer') =>
  new Error(`An unexpected error occurred invoking '${method}' on the server. HubException: ${code}`);
/** How it rejects one whose connection went down before the reply came. */
const cutOff = () => new Error('Invocation canceled due to the underlying connection being closed.');
const ticks = () => act(() => vi.advanceTimersByTimeAsync(0));

const peer = { id: '42', type: 'driver' as const, initials: 'AK', name: 'Ali Karimov', sub: 'Cobalt' };
/** The pair's agreement as the presence hub sends it. */
const agreementDto: AgreementDto = { id: 'a1', peer: { userId: '42', name: 'Ali Karimov', type: 'driver' }, status: 'agreed', version: 1 };
/** The server's agreement with the peer reaches this device (AgreementUpdated over presence), and
    whatever waited on it goes on. */
const agreementArrives = () => act(async () => {
  agreementStore.upsert(agreementDto);
  await vi.advanceTimersByTimeAsync(0);
});
/** The agreement is here, though nothing announced it (no store event): only a check finds it. */
const agreementHeldQuietly = () => vi.spyOn(agreementStore, 'serverAgreements').mockReturnValue([toAgreement(agreementDto)]);

function setup() {
  const notify = vi.fn();
  const hook = renderHook(() => useCallSession({
    authReady: true, notify, mapHook: {} as never, userLocRef: { current: null },
    liveWalkersRef: { current: new Map() }, contactsRef: { current: [] },
  }));
  return { notify, hook, offer: () => hook.result.current.callState?.offer };
}

/** I called the peer and they picked up. */
async function asCaller() {
  const s = setup();
  await act(async () => { await s.hook.result.current.handleCall(peer); });
  server('accepted', { callId: '7', byUserId: '42' });
  return s;
}

/** The peer called me and I picked up. */
async function asCallee() {
  const s = setup();
  server('incoming', { callId: '7', fromUserId: '42', caller: { name: 'Ali Karimov', kind: 'Driver' } });
  await act(async () => { s.hook.result.current.handleAcceptCall(); });
  await ticks();
  return s;
}

/** I offered in the call. */
async function offered(s: Awaited<ReturnType<typeof asCaller>>) {
  act(() => { s.hook.result.current.offerRide(); });
  await ticks();
}

/** Subscriptions to agreement changes still open (the hook's watch, a wait for the agreement). */
let agreementListeners = 0;
let listenerSpies: { mockRestore: () => void }[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  i18nStore.set('en');
  agreementStore.reset();
  call.handlers.clear();
  call.sendRideOffer.mockReset().mockResolvedValue(undefined);
  call.respondRideOffer.mockReset().mockResolvedValue(undefined);
  call.startCall.mockReset().mockResolvedValue('7');
  agreements.whenAgreedWith.mockReset().mockImplementation(whenAgreedWith);
  agreements.agreedInCall.mockReset();
  companions.recordCompanion.mockReset();
  contacts.addContact.mockReset().mockResolvedValue(undefined);
  agreementListeners = 0;
  const add = window.addEventListener.bind(window);
  const remove = window.removeEventListener.bind(window);
  listenerSpies = [
    vi.spyOn(window, 'addEventListener').mockImplementation((type, ...rest) => {
      if (type === AGREEMENT_EVENT) agreementListeners += 1;
      add(type, ...rest);
    }),
    vi.spyOn(window, 'removeEventListener').mockImplementation((type, ...rest) => {
      if (type === AGREEMENT_EVENT) agreementListeners -= 1;
      remove(type, ...rest);
    }),
  ];
});
afterEach(() => { cleanup(); listenerSpies.forEach((s) => s.mockRestore()); vi.useRealTimers(); });

const toldExpired = (notify: ReturnType<typeof vi.fn>) =>
  notify.mock.calls.some(([n]) => (n as { title?: string }).title === t('call.offerExpired'));
const toldAgreed = (notify: ReturnType<typeof vi.fn>) =>
  notify.mock.calls.filter(([n]) => (n as { title?: string }).title === t('push.rideAgreedTitle')).length;

describe('the "ride together" offer in a call — the one who made it', () => {
  it('stops waiting once the server would no longer hold the offer, says so on the call screen, and can offer again', async () => {
    const s = await asCaller();
    await offered(s);
    expect(call.sendRideOffer).toHaveBeenCalledTimes(1);
    expect(s.offer()).toBe('sent');

    await act(() => vi.advanceTimersByTimeAsync(RIDE_OFFER_LIFETIME_MS));
    expect(s.offer()).toBe('sent'); // an answer given at the very end may still be on its way

    await act(() => vi.advanceTimersByTimeAsync(RIDE_OFFER_WAIT_MS - RIDE_OFFER_LIFETIME_MS));
    expect(s.offer()).toBe('expired'); // the call screen's line — a toast would sit under it
    expect(toldExpired(s.notify)).toBe(false);

    await offered(s);
    expect(s.offer()).toBe('sent');
    expect(call.sendRideOffer).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['there is no connection', () => appError('REALTIME_OFFLINE'), 'errors.realtimeOffline'],
    ['the server asks to slow down', () => refused('rate_limited', 'SendRideOffer'), 'errors.rateLimited'],
    ['one of them blocked the other', () => refused('user_blocked', 'SendRideOffer'), 'errors.userBlocked'],
    ['the call is over on the server', () => refused('call_not_active', 'SendRideOffer'), 'errors.generic'],
  ])('an offer that could not be sent (%s) says why on the call screen, not in a toast under it', async (_why, error, key) => {
    const s = await asCaller();
    call.sendRideOffer.mockRejectedValueOnce(error());

    await offered(s);

    expect(s.offer()).toEqual({ failed: t(key) });
    expect(s.notify).not.toHaveBeenCalled();
    await offered(s); // the offer button is back
    expect(s.offer()).toBe('sent');
  });

  it('an accept that came after the server stopped holding the offer reads "no longer valid", and the "not accepted" after it changes nothing', async () => {
    const s = await asCaller();
    await offered(s);

    serverBurst(
      ['rideOfferExpired', { callId: '7', byUserId: '42' }],
      ['rideOfferAnswered', { callId: '7', byUserId: '42', accepted: false }], // sent after it, for older apps
    );
    expect(s.offer()).toBe('expired'); // never "declined": they did accept

    server('rideOfferAnswered', { callId: '7', byUserId: '42', accepted: false }); // a second tap of an older app
    await act(() => vi.advanceTimersByTimeAsync(RIDE_OFFER_WAIT_MS));
    expect(s.offer()).toBe('expired');
    expect(toldExpired(s.notify)).toBe(false);
  });

  it('an older server says only "not accepted" for an offer it lost: that reads "declined", as before', async () => {
    const s = await asCaller();
    await offered(s);

    server('rideOfferAnswered', { callId: '7', byUserId: '42', accepted: false });

    expect(s.offer()).toBe('declined'); // the offer button is back
    await act(() => vi.advanceTimersByTimeAsync(RIDE_OFFER_WAIT_MS));
    expect(s.offer()).toBe('declined');
  });

  it('the agreement reaching this device over presence settles the offer whose answer was lost', async () => {
    const s = await asCaller();
    await offered(s);

    await agreementArrives(); // the call hub's "accepted" was lost in a reconnect

    expect(s.offer()).toBe('agreed');
    expect(companions.recordCompanion).toHaveBeenCalledWith('42');
    expect(contacts.addContact).toHaveBeenCalledWith('42');
    // Nothing later undoes it or counts it twice: not the timer, not a late answer.
    server('rideOfferAnswered', { callId: '7', byUserId: '42', accepted: true });
    await act(() => vi.advanceTimersByTimeAsync(RIDE_OFFER_WAIT_MS));
    expect(s.offer()).toBe('agreed');
    expect(toldExpired(s.notify)).toBe(false);
    expect(companions.recordCompanion).toHaveBeenCalledTimes(1);
    expect(agreements.agreedInCall).toHaveBeenCalledTimes(1);
  });

  it('the answer and the agreement both reaching this device count it once', async () => {
    const s = await asCaller();
    await offered(s);

    server('rideOfferAnswered', { callId: '7', byUserId: '42', accepted: true });
    expect(s.offer()).toBe('sent'); // waiting for the server's agreement
    await agreementArrives();

    expect(s.offer()).toBe('agreed');
    expect(companions.recordCompanion).toHaveBeenCalledTimes(1);
    expect(contacts.addContact).toHaveBeenCalledTimes(1);
    expect(agreements.agreedInCall).toHaveBeenCalledTimes(1);
    expect(toldAgreed(s.notify)).toBe(1);
  });

  it('an accepted answer whose agreement does not come says so on the call screen — and the agreement turning up later still counts', async () => {
    const s = await asCaller();
    await offered(s);

    server('rideOfferAnswered', { callId: '7', byUserId: '42', accepted: true });
    await act(() => vi.advanceTimersByTimeAsync(AGREEMENT_WAIT_MS));

    expect(s.offer()).toEqual({ failed: t('call.offerUnconfirmed') });
    expect(s.notify).not.toHaveBeenCalled(); // a toast would sit under the call screen
    expect(companions.recordCompanion).not.toHaveBeenCalled();

    await agreementArrives(); // presence was late, not gone
    expect(s.offer()).toBe('agreed');
    expect(companions.recordCompanion).toHaveBeenCalledTimes(1);
  });

  it('when its time is up while the pair\'s agreement is here, it reads agreed — never "no longer valid"', async () => {
    const s = await asCaller();
    await offered(s);
    const held = agreementHeldQuietly();
    try {
      await act(() => vi.advanceTimersByTimeAsync(RIDE_OFFER_WAIT_MS));
      expect(s.offer()).toBe('agreed');
      expect(companions.recordCompanion).toHaveBeenCalledWith('42');
      expect(contacts.addContact).toHaveBeenCalledWith('42');
    } finally { held.mockRestore(); }
  });

  it('told the offer is gone while the pair\'s agreement is here: agreed, not expired', async () => {
    const s = await asCaller();
    await offered(s);
    const held = agreementHeldQuietly();
    try {
      server('rideOfferExpired', { callId: '7', byUserId: '42' });
      expect(s.offer()).toBe('agreed');
      expect(companions.recordCompanion).toHaveBeenCalledWith('42');
    } finally { held.mockRestore(); }
  });
});

describe('the "ride together" offer in a call — the one it was made to', () => {
  it('stops showing an offer the server no longer holds, and says so on the call screen', async () => {
    const { notify, offer } = await asCallee();
    server('rideOffer', { callId: '7', fromUserId: '42' });
    expect(offer()).toBe('received');

    await act(() => vi.advanceTimersByTimeAsync(RIDE_OFFER_LIFETIME_MS - 1));
    expect(offer()).toBe('received');
    await act(() => vi.advanceTimersByTimeAsync(1));

    expect(offer()).toBe('expired');
    expect(toldExpired(notify)).toBe(false);
  });

  it('accepting an offer that is gone says so at once — no agreement, no companion', async () => {
    const { hook, notify, offer } = await asCallee();
    server('rideOffer', { callId: '7', fromUserId: '42' });
    call.respondRideOffer.mockRejectedValue(refused('offer_expired'));

    act(() => { hook.result.current.respondRide(true); });
    await ticks();

    expect(offer()).toBe('expired'); // what the one who offered reads too (RideOfferExpired)
    expect(notify).not.toHaveBeenCalled();
    expect(agreements.whenAgreedWith).not.toHaveBeenCalled();
    expect(companions.recordCompanion).not.toHaveBeenCalled();
  });

  it('answers once, however fast the taps come, and an accepted offer becomes the agreement', async () => {
    const { hook, offer } = await asCallee();
    server('rideOffer', { callId: '7', fromUserId: '42' });

    act(() => {
      hook.result.current.respondRide(true);
      hook.result.current.respondRide(true); // the same frame: the buttons are still there
    });
    await ticks();
    expect(call.respondRideOffer).toHaveBeenCalledTimes(1);
    expect(offer()).toBe('sent'); // waiting for the server's agreement

    await agreementArrives();
    expect(offer()).toBe('agreed');
    expect(companions.recordCompanion).toHaveBeenCalledTimes(1);
  });

  it('declining answers once and puts the offer away', async () => {
    const { hook, offer } = await asCallee();
    server('rideOffer', { callId: '7', fromUserId: '42' });

    act(() => {
      hook.result.current.respondRide(false);
      hook.result.current.respondRide(false);
    });

    expect(call.respondRideOffer).toHaveBeenCalledTimes(1);
    expect(call.respondRideOffer).toHaveBeenCalledWith(false);
    expect(offer()).toBe('none');
  });

  it.each([
    ['there is no connection', () => appError('REALTIME_OFFLINE')],
    ['the server asks to slow down', () => refused('rate_limited')],
    ['the connection drops before the reply', cutOff],
  ])('an accept that did not get through (%s) leaves the offer open and says "tap again"', async (_why, error) => {
    const { hook, notify, offer } = await asCallee();
    server('rideOffer', { callId: '7', fromUserId: '42' });
    call.respondRideOffer.mockRejectedValueOnce(error());

    act(() => { hook.result.current.respondRide(true); });
    await ticks();

    expect(offer()).toBe('unsent'); // the offer still stands, with a line saying the answer did not arrive
    expect(notify).not.toHaveBeenCalled();
    expect(agreements.whenAgreedWith).not.toHaveBeenCalled();

    act(() => { hook.result.current.respondRide(true); });
    await ticks();
    expect(call.respondRideOffer).toHaveBeenCalledTimes(2);
    await agreementArrives();
    expect(offer()).toBe('agreed');
  });

  it('an accept cut off with the connection that did arrive comes back as the agreement', async () => {
    const { hook, offer } = await asCallee();
    server('rideOffer', { callId: '7', fromUserId: '42' });
    call.respondRideOffer.mockRejectedValueOnce(cutOff());
    act(() => { hook.result.current.respondRide(true); });
    await ticks();
    expect(offer()).toBe('unsent');

    await agreementArrives(); // GetAgreements after the reconnect

    expect(offer()).toBe('agreed');
    expect(companions.recordCompanion).toHaveBeenCalledWith('42');
  });

  it('an offer left open after an accept that did not get through still ends when the server lets it go', async () => {
    const { hook, offer } = await asCallee();
    server('rideOffer', { callId: '7', fromUserId: '42' });
    await act(() => vi.advanceTimersByTimeAsync(RIDE_OFFER_LIFETIME_MS - 60_000));
    call.respondRideOffer.mockRejectedValueOnce(refused('rate_limited'));
    act(() => { hook.result.current.respondRide(true); });
    await ticks();
    expect(offer()).toBe('unsent');

    await act(() => vi.advanceTimersByTimeAsync(60_000)); // its own ten minutes, not ten more
    expect(offer()).toBe('expired');
  });

  it('a fault on the server while accepting still waits for the agreement, and says so on the call screen when none came', async () => {
    const { hook, notify, offer } = await asCallee();
    server('rideOffer', { callId: '7', fromUserId: '42' });
    call.respondRideOffer.mockRejectedValueOnce(new Error("An unexpected error occurred invoking 'RespondRideOffer' on the server."));
    act(() => { hook.result.current.respondRide(true); });
    await ticks();

    expect(agreements.whenAgreedWith).toHaveBeenCalledWith('42');
    expect(offer()).toBe('sent');
    await act(() => vi.advanceTimersByTimeAsync(AGREEMENT_WAIT_MS));
    expect(offer()).toEqual({ failed: t('call.offerUnconfirmed') });
    expect(notify).not.toHaveBeenCalled();
  });

  it('the agreement reaching this device while their offer is on screen settles it', async () => {
    const { offer } = await asCallee();
    server('rideOffer', { callId: '7', fromUserId: '42' });

    await agreementArrives();

    expect(offer()).toBe('agreed');
    expect(companions.recordCompanion).toHaveBeenCalledWith('42');
    await act(() => vi.advanceTimersByTimeAsync(RIDE_OFFER_LIFETIME_MS));
    expect(offer()).toBe('agreed');
  });

  it('both offered at once: the peer taking mine while I still see theirs is the agreement', async () => {
    const s = await asCaller();
    await offered(s);
    server('rideOffer', { callId: '7', fromUserId: '42' }); // theirs crossed mine
    expect(s.offer()).toBe('received');

    // A "no" to mine, or mine gone, leaves theirs to answer.
    server('rideOfferAnswered', { callId: '7', byUserId: '42', accepted: false });
    server('rideOfferExpired', { callId: '7', byUserId: '42' });
    expect(s.offer()).toBe('received');

    server('rideOfferAnswered', { callId: '7', byUserId: '42', accepted: true });
    await agreementArrives();
    expect(s.offer()).toBe('agreed');
    expect(companions.recordCompanion).toHaveBeenCalledWith('42');
  });

  it('an offer the server relays waits for my own tap, even with an agreement in this device\'s copy (it may be stale)', async () => {
    // The server answers an offer between an agreed pair itself, so one that reaches me means it
    // holds no agreement for us: my copy fell behind (its end never reached this device).
    agreementStore.upsert(agreementDto);
    const { offer } = await asCallee();
    expect(offer()).toBe('none'); // no news by itself

    server('rideOffer', { callId: '7', fromUserId: '42' });
    await ticks();
    window.dispatchEvent(new Event(AGREEMENT_EVENT)); // another agreement change: no news about us
    await ticks();

    expect(offer()).toBe('received');
    expect(call.respondRideOffer).not.toHaveBeenCalled();
    expect(companions.recordCompanion).not.toHaveBeenCalled();
  });
});

describe('the "ride together" offer to someone the pair is agreed with already', () => {
  it('the server answers it as accepted: the call screen reads agreed once the agreement is here', async () => {
    const s = await asCaller();
    await offered(s);
    expect(s.offer()).toBe('sent');

    server('rideOfferAnswered', { callId: '7', byUserId: '42', accepted: true });
    await agreementArrives(); // shown to my devices again with the answer

    expect(s.offer()).toBe('agreed');
    expect(companions.recordCompanion).toHaveBeenCalledTimes(1);
    expect(call.respondRideOffer).not.toHaveBeenCalled();
  });
});

describe('the agreement after the offer closed, while the call lasts', () => {
  it('accepting an offer the server calls gone, then the agreement showing up after all, turns the call screen agreed — once', async () => {
    // The first accept's reply was lost (the agreement was made), the second is refused before presence caught up.
    const { hook, notify, offer } = await asCallee();
    server('rideOffer', { callId: '7', fromUserId: '42' });
    call.respondRideOffer.mockRejectedValueOnce(cutOff()).mockRejectedValueOnce(refused('offer_expired'));
    act(() => { hook.result.current.respondRide(true); });
    await ticks();
    act(() => { hook.result.current.respondRide(true); });
    await ticks();
    expect(offer()).toBe('expired');

    await agreementArrives();

    expect(offer()).toBe('agreed');
    expect(companions.recordCompanion).toHaveBeenCalledTimes(1);
    expect(contacts.addContact).toHaveBeenCalledTimes(1);
    expect(toldAgreed(notify)).toBe(1);
  });

  it('a declined offer gives way to the agreement too, while one the pair had before the call changes nothing by itself', async () => {
    const s = await asCaller();
    await offered(s);
    server('rideOfferAnswered', { callId: '7', byUserId: '42', accepted: false });
    expect(s.offer()).toBe('declined');

    await agreementArrives(); // however it came about, the pair is agreed now
    expect(s.offer()).toBe('agreed');
    expect(companions.recordCompanion).toHaveBeenCalledTimes(1);
    cleanup();

    // Agreed before this call: a new call opens as any other — no "agreed", nothing confirmed again.
    companions.recordCompanion.mockReset();
    const next = await asCaller();
    expect(next.offer()).toBe('none');
    expect(companions.recordCompanion).not.toHaveBeenCalled();
  });
});

describe('the agreement after the call ended', () => {
  it('accepting and then ending the call at once: the agreement that comes after still counts — once, with nothing left running', async () => {
    const { hook, notify } = await asCallee();
    server('rideOffer', { callId: '7', fromUserId: '42' });

    act(() => {
      hook.result.current.respondRide(true);
      hook.result.current.endCall(); // the hang-up reaches the server after the accept
    });
    await ticks();
    expect(hook.result.current.callState).toBeNull();

    await agreementArrives(); // over presence, after the call screen is gone

    expect(companions.recordCompanion).toHaveBeenCalledTimes(1);
    expect(companions.recordCompanion).toHaveBeenCalledWith('42');
    expect(contacts.addContact).toHaveBeenCalledTimes(1);
    expect(agreements.agreedInCall).toHaveBeenCalledTimes(1);
    expect(toldAgreed(notify)).toBe(1); // a toast is in view now
    expect(vi.getTimerCount()).toBe(0);
    expect(agreementListeners).toBe(0);
  });

  it('the offerer\'s call ending before the agreement arrives (two sockets, no order between them) still counts it', async () => {
    const s = await asCaller();
    await offered(s);
    server('rideOfferAnswered', { callId: '7', byUserId: '42', accepted: true });
    server('ended', { callId: '7', byUserId: '42' });
    expect(s.hook.result.current.callState).toBeNull();

    await agreementArrives();

    expect(companions.recordCompanion).toHaveBeenCalledTimes(1);
    expect(contacts.addContact).toHaveBeenCalledTimes(1);
    expect(toldAgreed(s.notify)).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(agreementListeners).toBe(0);
  });

  it('hanging up with my offer open: an accept that crossed the hang-up still counts', async () => {
    const s = await asCaller();
    await offered(s);

    act(() => { s.hook.result.current.endCall(); }); // its answer finds no call here any more
    await agreementArrives();

    expect(companions.recordCompanion).toHaveBeenCalledTimes(1);
    expect(contacts.addContact).toHaveBeenCalledTimes(1);
  });

  it('an accept whose reply was lost, then the call ended: its agreement still counts', async () => {
    const { hook } = await asCallee();
    server('rideOffer', { callId: '7', fromUserId: '42' });
    call.respondRideOffer.mockRejectedValueOnce(cutOff());
    act(() => { hook.result.current.respondRide(true); });
    await ticks();

    act(() => { hook.result.current.endCall(); });
    await agreementArrives(); // GetAgreements after the reconnect, the call screen gone

    expect(companions.recordCompanion).toHaveBeenCalledTimes(1);
  });

  it('the wait after the call is bounded: no agreement in time, nothing counted — and nothing left running', async () => {
    const s = await asCaller();
    await offered(s);
    server('rideOfferAnswered', { callId: '7', byUserId: '42', accepted: true });
    server('ended', { callId: '7', byUserId: '42' });
    expect(agreementListeners).toBe(1); // still waiting, past the call
    expect(vi.getTimerCount()).toBe(1);

    await act(() => vi.advanceTimersByTimeAsync(AGREEMENT_WAIT_MS));
    expect(vi.getTimerCount()).toBe(0);
    expect(agreementListeners).toBe(0);
    await agreementArrives(); // too late for this device to take it as this call's

    expect(companions.recordCompanion).not.toHaveBeenCalled();
    expect(s.notify).not.toHaveBeenCalled();
  });

  it('an accept that surely never went out, then the call ended, waits for nothing', async () => {
    const { hook } = await asCallee();
    server('rideOffer', { callId: '7', fromUserId: '42' });
    call.respondRideOffer.mockRejectedValueOnce(appError('REALTIME_OFFLINE'));
    act(() => { hook.result.current.respondRide(true); });
    await ticks();

    act(() => { hook.result.current.endCall(); });

    expect(agreements.whenAgreedWith).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(agreementListeners).toBe(0);
  });
});
