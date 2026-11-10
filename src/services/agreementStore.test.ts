import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AgreementDto } from './agreementStore';

async function load() {
  vi.resetModules();
  return import('./agreementStore');
}

const dto = (over: Partial<AgreementDto> = {}): AgreementDto => ({
  id: 'a1',
  peer: { userId: '7', name: 'Aziz Karimov', type: 'driver', vehicle: 'Cobalt · Oq · 01A123BC', photoUrl: null },
  status: 'agreed',
  arrivedBy: [],
  sinceUtc: '2026-11-05T10:00:00Z',
  version: 1,
  ...over,
});

beforeEach(() => localStorage.clear());

describe('agreement store', () => {
  it('maps the hub DTO to my side: my arrival is the status, theirs is peerArrived', async () => {
    const { toAgreement } = await load();

    const theirs = toAgreement(dto({ arrivedBy: ['7'], status: 'arrived' }));
    expect(theirs).toMatchObject({ id: 'a1', status: 'agreed', peerArrived: true,
      peer: { id: '7', name: 'Aziz Karimov', initials: 'AK', type: 'driver', vehicle: 'Cobalt · Oq · 01A123BC' } });
    expect(theirs.since).toBe(Date.parse('2026-11-05T10:00:00Z'));

    const mine = toAgreement(dto({ arrivedBy: ['3'], status: 'arrived' }));
    expect(mine).toMatchObject({ status: 'arrived', peerArrived: false });
  });

  it('shows the local agreement first, until the server confirms the same person', async () => {
    const { agreementStore } = await load();
    agreementStore.upsert(dto({ id: 'old', peer: { userId: '5', name: 'Old', type: 'driver' }, sinceUtc: '2026-11-05T09:00:00Z' }));

    agreementStore.set({ peer: { id: '7', name: 'Aziz', initials: 'A', type: 'driver' }, status: 'pending', since: Date.now() });
    expect(agreementStore.get()?.status).toBe('pending');

    agreementStore.patch({ status: 'agreed' }); // confirmed in the call, not echoed yet
    agreementStore.upsert(dto());
    expect(agreementStore.local()).toBeNull();
    expect(agreementStore.get()?.id).toBe('a1'); // the newest server agreement
    expect(agreementStore.all().map((a) => a.id)).toEqual(['a1', 'old']);
  });

  it('ignores an older copy and anything about an agreement that already ended', async () => {
    const { agreementStore } = await load();
    agreementStore.upsert(dto({ version: 3, arrivedBy: ['7'] }));

    expect(agreementStore.upsert(dto({ version: 2 }))).toBeNull();
    expect(agreementStore.get()?.peerArrived).toBe(true);

    agreementStore.remove('a1');
    expect(agreementStore.upsert(dto({ version: 9 }))).toBeNull();
    expect(agreementStore.hydrate([dto({ version: 9 })])).toEqual([]);
    expect(agreementStore.get()).toBeNull();
  });

  it('a snapshot reports what ended while we were away', async () => {
    const { agreementStore } = await load();
    agreementStore.hydrate([dto(), dto({ id: 'a2', peer: { userId: '8', name: 'Bek', type: 'driver' } })]);

    const gone = agreementStore.hydrate([dto()]);

    expect(gone.map((a) => a.id)).toEqual(['a2']);
    expect(agreementStore.serverAgreements().map((a) => a.id)).toEqual(['a1']);
  });

  it('keeps my own "I\'m here" over a server copy that does not have it yet', async () => {
    const { agreementStore } = await load();
    agreementStore.upsert(dto());
    agreementStore.markArrived('a1');

    agreementStore.upsert(dto({ version: 2, arrivedBy: ['7'] })); // they arrived too, mine is in flight

    expect(agreementStore.get()).toMatchObject({ status: 'arrived', peerArrived: true });
  });
});
