import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgreementDto } from './agreementStore';

// A fake presence hub: the service subscribes to its events, registers a
// resync step and invokes commands on the live connection.
const hub = vi.hoisted(() => {
  const handlers = new Map<string, (payload: unknown) => void>();
  const steps: Array<(conn: unknown) => Promise<void>> = [];
  const conn = { state: 'Connected', invoke: vi.fn() };
  return { handlers, steps, conn, online: true };
});
vi.mock('@/services/realtime', () => ({
  presenceClient: {
    on: (event: string, fn: (payload: unknown) => void) => { hub.handlers.set(event, fn); return () => {}; },
    onResync: (step: (conn: unknown) => Promise<void>) => { hub.steps.push(step); return () => {}; },
    connection: () => (hub.online ? hub.conn : null),
  },
}));

const dto = (over: Partial<AgreementDto> = {}): AgreementDto => ({
  id: 'a1',
  peer: { userId: '7', name: 'Aziz Karimov', type: 'driver', vehicle: null, photoUrl: null },
  status: 'agreed',
  arrivedBy: [],
  sinceUtc: '2026-11-05T10:00:00Z',
  version: 1,
  ...over,
});

let serverList: AgreementDto[] = [];

/** Fresh modules (the outbox is read from storage on import). */
async function load() {
  vi.resetModules();
  hub.handlers.clear();
  hub.steps.length = 0;
  const { agreementService } = await import('./agreementService');
  const { agreementStore } = await import('./agreementStore');
  const events: unknown[] = [];
  agreementService.onPeerEvent((e) => events.push({ kind: e.kind, id: e.agreement.id ?? e.agreement.peer.id }));
  return { agreementService, agreementStore, events };
}

const push = (event: string, payload: unknown) => hub.handlers.get(event)!(payload);
/** The presence hub (re)connected: run the registered resync steps. */
const reconnect = async () => { for (const step of hub.steps) await step(hub.conn); };
const settle = () => new Promise((r) => setTimeout(r, 0));
const calls = (method: string) => hub.conn.invoke.mock.calls.filter((c) => c[0] === method);

beforeEach(() => {
  localStorage.clear();
  hub.online = true;
  serverList = [];
  hub.conn.invoke.mockReset().mockImplementation((method: string) =>
    Promise.resolve(method === 'GetAgreements' ? serverList : undefined));
});

describe('agreement service', () => {
  it('hydrates from the server on connect, so the agreement survives a reload', async () => {
    const { agreementStore } = await load();
    serverList = [dto()];

    await reconnect();

    expect(agreementStore.get()).toMatchObject({ id: 'a1', status: 'agreed', peer: { id: '7', type: 'driver' } });
  });

  it('tells about the other person once: at the pick-up, then cancelled — my own actions stay silent', async () => {
    const { agreementStore, events } = await load();
    push('AgreementUpdated', dto());
    push('AgreementUpdated', dto({ version: 2, status: 'arrived', arrivedBy: ['7'] }));
    push('AgreementUpdated', dto({ version: 2, status: 'arrived', arrivedBy: ['7'] })); // a duplicate
    expect(events).toEqual([{ kind: 'arrived', id: 'a1' }]);

    push('AgreementEnded', { agreementId: 'a1', peerId: '7', reason: 'cancelled', byUserId: '7' });
    expect(events).toEqual([{ kind: 'arrived', id: 'a1' }, { kind: 'cancelled', id: 'a1' }]);
    expect(agreementStore.get()).toBeNull();

    // Ended by me on another device: just gone.
    push('AgreementUpdated', dto({ id: 'a2' }));
    push('AgreementEnded', { agreementId: 'a2', peerId: '7', reason: 'completed', byUserId: '3' });
    expect(events).toHaveLength(2);

    // Blocked by them / expired: "ended".
    push('AgreementUpdated', dto({ id: 'a3' }));
    push('AgreementEnded', { agreementId: 'a3', peerId: '7', reason: 'blocked', byUserId: '7' });
    expect(events.at(-1)).toEqual({ kind: 'ended', id: 'a3' });
  });

  it('cancels at once and sends it; offline it is kept (across a restart) and sent on reconnect', async () => {
    let { agreementService, agreementStore } = await load();
    push('AgreementUpdated', dto());
    hub.online = false;

    agreementService.cancel();
    await settle();
    expect(agreementStore.get()).toBeNull();
    expect(calls('CancelAgreement')).toHaveLength(0);

    ({ agreementService, agreementStore } = await load()); // the app was closed and reopened
    serverList = [dto()]; // the server still has it: the cancel never arrived
    hub.online = true;
    await reconnect();

    expect(calls('CancelAgreement')).toEqual([['CancelAgreement', 'a1']]);
    expect(agreementService.pending()).toEqual([]);
    // The cancel went out before the snapshot was read.
    const order = hub.conn.invoke.mock.calls.map((c) => c[0]);
    expect(order.indexOf('CancelAgreement')).toBeLessThan(order.indexOf('GetAgreements'));
  });

  it('a cancel cut short by a lost connection is not undone by the snapshot', async () => {
    const { agreementService, agreementStore } = await load();
    push('AgreementUpdated', dto());
    hub.online = false;
    agreementService.cancel();
    await settle();

    // Reconnects, but drops again while sending the cancel; the snapshot still lists it.
    serverList = [dto()];
    hub.online = true;
    hub.conn.invoke.mockImplementation((method: string) => (method === 'CancelAgreement'
      ? Promise.reject(new Error('lost'))
      : Promise.resolve(method === 'GetAgreements' ? serverList : undefined)));
    hub.conn.state = 'Disconnected';
    await expect(hub.steps[0](hub.conn)).resolves.toBeUndefined();
    hub.conn.state = 'Connected';

    expect(agreementService.pending()).toEqual([{ kind: 'cancel', id: 'a1' }]);
    expect(agreementStore.get()).toBeNull();
  });

  it('"I\'m here" shows at once, is sent once however often it is tapped, and is replayed if unsent', async () => {
    const { agreementService, agreementStore } = await load();
    push('AgreementUpdated', dto());

    expect(agreementService.markArrived()?.status).toBe('arrived');
    agreementService.markArrived();
    await settle();
    expect(calls('MarkArrived')).toEqual([['MarkArrived', 'a1']]);

    // Offline: kept, sent on reconnect before the snapshot is read.
    const bek = { userId: '8', name: 'Bek', type: 'driver' };
    push('AgreementUpdated', dto({ id: 'a2', peer: bek, sinceUtc: '2026-11-05T11:00:00Z' }));
    hub.online = false;
    agreementService.markArrived(); // the newest one: a2
    await settle();
    expect(agreementStore.byId('a2')?.status).toBe('arrived');
    expect(agreementService.pending()).toEqual([{ kind: 'arrived', id: 'a2' }]);

    serverList = [dto({ arrivedBy: ['3'] }), dto({ id: 'a2', peer: bek, sinceUtc: '2026-11-05T11:00:00Z', arrivedBy: ['3'] })];
    hub.online = true;
    await reconnect();
    expect(calls('MarkArrived')).toEqual([['MarkArrived', 'a1'], ['MarkArrived', 'a2']]);
    expect(agreementService.pending()).toEqual([]);
    expect(agreementStore.byId('a2')?.status).toBe('arrived');
  });

  it('"I\'m here" cut short by a lost connection stays applied over the snapshot', async () => {
    const { agreementService, agreementStore } = await load();
    push('AgreementUpdated', dto());
    hub.online = false;
    agreementService.markArrived();
    await settle();

    serverList = [dto()]; // has not seen it
    hub.online = true;
    hub.conn.invoke.mockImplementation((method: string) => (method === 'MarkArrived'
      ? Promise.reject(new Error('lost'))
      : Promise.resolve(method === 'GetAgreements' ? serverList : undefined)));
    hub.conn.state = 'Disconnected';
    await hub.steps[0](hub.conn).catch(() => {});
    hub.conn.state = 'Connected';

    expect(agreementService.pending()).toEqual([{ kind: 'arrived', id: 'a1' }]); // sent on the next connect
    expect(agreementStore.get()?.status).toBe('arrived');
  });

  it('what ended while we were away is reported as ended on reconnect', async () => {
    const { events } = await load();
    push('AgreementUpdated', dto());

    serverList = [];
    await reconnect();

    expect(events).toEqual([{ kind: 'ended', id: 'a1' }]);
  });

  it('finishing the journey completes every agreement; demo ones stay local', async () => {
    const { agreementService, agreementStore } = await load();
    push('AgreementUpdated', dto());
    push('AgreementUpdated', dto({ id: 'a2', peer: { userId: '8', name: 'Bek', type: 'driver' } }));
    agreementStore.set({ peer: { id: 'sim_1', name: 'Demo', initials: 'D', type: 'driver' }, status: 'agreed', since: Date.now() });

    agreementService.complete();
    await settle();

    expect(agreementStore.all()).toEqual([]);
    expect(calls('CompleteAgreement').map((c) => c[1]).sort()).toEqual(['a1', 'a2']);
  });

  it('an in-call agreement shows at once and gives way to the server copy', async () => {
    const { agreementService, agreementStore } = await load();
    const peer = { id: '7', name: 'Aziz', initials: 'A', type: 'driver' as const };

    agreementService.agreedInCall(peer);
    expect(agreementStore.get()).toMatchObject({ status: 'agreed', peer: { id: '7' } });
    expect(agreementStore.get()?.id).toBeUndefined();

    push('AgreementUpdated', dto());
    expect(agreementStore.local()).toBeNull();
    expect(agreementStore.get()?.id).toBe('a1');

    agreementService.agreedInCall(peer); // the echo came first: nothing local is added
    expect(agreementStore.local()).toBeNull();
  });

  it('blocking the person drops a local agreement with them at once', async () => {
    const { agreementStore } = await load();
    const { blockStore } = await import('./blockStore');
    agreementStore.set({ peer: { id: 'sim_4', name: 'Demo', initials: 'D', type: 'driver' }, status: 'agreed', since: Date.now() });

    await blockStore.add('sim_4', { name: 'Demo' }); // a demo walker: local-only block

    expect(agreementStore.get()).toBeNull();
    expect(hub.conn.invoke).not.toHaveBeenCalled();
  });

  it('cancelling a local (pending / demo) agreement sends nothing', async () => {
    const { agreementService, agreementStore } = await load();
    agreementStore.set({ peer: { id: '7', name: 'Aziz', initials: 'A', type: 'driver' }, status: 'pending', since: Date.now() });

    agreementService.cancel();
    await settle();

    expect(agreementStore.get()).toBeNull();
    expect(hub.conn.invoke).not.toHaveBeenCalled();
  });

  // --- companions: whoever the agreement ended with is no companion of my journey ---

  it('forgets the companion when the agreement is called off, blocked, expired or gone — not when completed', async () => {
    const { agreementService } = await load();
    const { recordCompanion, recordedCompanions } = await import('./liveTripService');
    const peer = (id: string) => ({ userId: id, name: 'P ' + id, type: 'driver' });
    ['7', '8', '9', '10', '11', '12'].forEach(recordCompanion);
    ['7', '8', '9', '10', '11', '12'].forEach((id) => push('AgreementUpdated', dto({ id: 'a' + id, peer: peer(id) })));

    push('AgreementEnded', { agreementId: 'a7', peerId: '7', reason: 'cancelled', byUserId: '7' });
    push('AgreementEnded', { agreementId: 'a8', peerId: '8', reason: 'cancelled', byUserId: '3' }); // me, another device
    push('AgreementEnded', { agreementId: 'a9', peerId: '9', reason: 'blocked', byUserId: '9' });
    push('AgreementEnded', { agreementId: 'a10', peerId: '10', reason: 'expired', byUserId: null });
    push('AgreementEnded', { agreementId: 'a11', peerId: '11', reason: 'completed', byUserId: '11' });
    serverList = [dto({ id: 'a11', peer: peer('11') })]; // a12 ended while we were away
    await reconnect();
    agreementService.pending(); // (nothing queued)

    expect(recordedCompanions()).toEqual(['11']);
  });

  it('my own cancel forgets the companion at once', async () => {
    const { agreementService } = await load();
    const { recordCompanion, recordedCompanions } = await import('./liveTripService');
    recordCompanion('7');
    push('AgreementUpdated', dto());

    agreementService.cancel();

    expect(recordedCompanions()).toEqual([]);
  });

  // --- a server fault is not a refusal ------------------------------------------

  it('keeps a command the server failed on (not refused) and sends it again', async () => {
    vi.useFakeTimers();
    try {
      const { agreementService } = await load();
      push('AgreementUpdated', dto());
      hub.conn.invoke.mockRejectedValueOnce(new Error("An unexpected error occurred invoking 'CancelAgreement' on the server."));

      agreementService.cancel();
      await vi.advanceTimersByTimeAsync(0);
      expect(agreementService.pending()).toEqual([{ kind: 'cancel', id: 'a1' }]);

      await vi.advanceTimersByTimeAsync(2_000); // the backoff runs out
      expect(calls('CancelAgreement')).toHaveLength(2);
      expect(agreementService.pending()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops a command the server refused', async () => {
    const { agreementService } = await load();
    push('AgreementUpdated', dto());
    hub.conn.invoke.mockRejectedValueOnce(new Error("An unexpected error occurred invoking 'CancelAgreement' on the server. HubException: agreementId is required."));

    agreementService.cancel();
    await settle();

    expect(agreementService.pending()).toEqual([]);
    expect(calls('CancelAgreement')).toHaveLength(1);
  });

  // --- an accepted offer counts once the server holds the agreement -----------------

  it('waits for the server agreement with that person, and gives up when none comes', async () => {
    const { agreementService } = await load();

    const confirmed = agreementService.whenAgreedWith('7', 1_000);
    push('AgreementUpdated', dto());
    await expect(confirmed).resolves.toBe(true);
    await expect(agreementService.whenAgreedWith('7')).resolves.toBe(true); // already there

    await expect(agreementService.whenAgreedWith('8', 50)).resolves.toBe(false);
  });
});
