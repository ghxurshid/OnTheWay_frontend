import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BlockedUser } from '@/api/blocksApi';

const api = vi.hoisted(() => ({ list: vi.fn(), block: vi.fn(), unblock: vi.fn() }));
vi.mock('@/api/blocksApi', () => ({ blocksApi: api }));

const row = (userId: string, name = 'User ' + userId, blockedAt = '2026-11-05T10:00:00Z'): BlockedUser =>
  ({ userId, name, photoUrl: null, blockedAt });

/** A deferred promise, to hold a request in flight. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** A fresh module (it reads its cache from storage on import). */
async function load() {
  vi.resetModules();
  return (await import('./blockStore')).blockStore;
}

beforeEach(() => {
  localStorage.clear();
  Object.values(api).forEach((fn) => fn.mockReset());
  api.list.mockResolvedValue([]);
  api.block.mockImplementation((id: string) => Promise.resolve(row(id)));
  api.unblock.mockResolvedValue(undefined);
});

describe('block store', () => {
  it('hydrates from the server and caches the list across a restart', async () => {
    api.list.mockResolvedValue([row('7', 'Aziz'), row('9', 'Malika')]);
    let store = await load();
    await store.hydrate();
    expect(store.list()).toEqual(['7', '9']);
    expect(store.has(7)).toBe(true); // number or string, same person

    store = await load(); // reopened, offline: the cache still filters the map
    expect(store.list()).toEqual(['7', '9']);
    expect(store.entries()[0].name).toBe('Aziz');
  });

  it('reads the older plain id cache', async () => {
    localStorage.setItem('otw-blocked', JSON.stringify(['5', 'sim_3']));
    const store = await load();
    expect(store.list()).toEqual(['5', 'sim_3']);
  });

  it('blocks optimistically and takes the server row', async () => {
    const store = await load();
    const call = deferred<BlockedUser>();
    api.block.mockReturnValueOnce(call.promise);

    const done = store.add('42', { name: 'Jasur' });
    expect(store.has('42')).toBe(true); // hidden at once
    expect(api.block).toHaveBeenCalledWith('42');

    call.resolve(row('42', 'Jasur Umarov', '2026-11-05T12:00:00Z'));
    await done;
    expect(store.entries()).toMatchObject([{ userId: '42', name: 'Jasur Umarov', blockedAt: '2026-11-05T12:00:00Z' }]);
  });

  it('rolls a refused block back and rejects so the caller can say why', async () => {
    const store = await load();
    api.block.mockRejectedValueOnce(new Error('offline'));
    await expect(store.add('42', { name: 'Jasur' })).rejects.toThrow('offline');
    expect(store.has('42')).toBe(false);
    expect(JSON.parse(localStorage.getItem('otw-blocked') || '[]')).toEqual([]);
  });

  it('rolls a refused unblock back into its place', async () => {
    api.list.mockResolvedValue([row('1'), row('2'), row('3')]);
    const store = await load();
    await store.hydrate();
    api.unblock.mockRejectedValueOnce(new Error('offline'));

    const done = store.remove('2');
    expect(store.has('2')).toBe(false); // shown again at once
    await expect(done).rejects.toThrow('offline');
    expect(store.list()).toEqual(['1', '2', '3']);
  });

  it('a late answer to a superseded block changes nothing', async () => {
    const store = await load();
    const call = deferred<BlockedUser>();
    api.block.mockReturnValueOnce(call.promise);
    const blocking = store.add('42');
    const unblocking = store.remove('42'); // changed their mind before the server answered
    call.reject(new Error('offline'));
    await expect(blocking).resolves.toBeUndefined(); // nothing to undo, nothing to report
    await unblocking;
    expect(store.has('42')).toBe(false);
    expect(api.unblock).toHaveBeenCalledWith('42'); // sent after the block, in order
  });

  it('keeps an op still in flight over a server list read before it landed', async () => {
    const store = await load();
    const call = deferred<BlockedUser>();
    api.block.mockReturnValueOnce(call.promise);
    const blocking = store.add('42');
    api.list.mockResolvedValueOnce([row('7')]); // snapshot without 42

    await store.hydrate();
    expect(store.list().sort()).toEqual(['42', '7']);
    call.resolve(row('42'));
    await blocking;
  });

  it('a block answered while the list was on its way is not undone by the older list', async () => {
    const store = await load();
    const list = deferred<BlockedUser[]>();
    api.list.mockReturnValueOnce(list.promise);
    const loading = store.hydrate();
    await store.add('42'); // done before the list arrives
    list.resolve([row('7')]); // read before the block landed
    await loading;
    expect(store.list().sort()).toEqual(['42', '7']);
  });

  it('an unblock answered while the list was on its way stays unblocked', async () => {
    api.list.mockResolvedValueOnce([row('7'), row('9')]);
    const store = await load();
    await store.hydrate();
    const list = deferred<BlockedUser[]>();
    api.list.mockReturnValueOnce(list.promise);
    const loading = store.hydrate();
    await store.remove('9');
    list.resolve([row('7'), row('9')]); // still lists 9
    await loading;
    expect(store.list()).toEqual(['7']);
  });

  it('someone not touched here follows the server (unblocked on another device)', async () => {
    api.list.mockResolvedValueOnce([row('7'), row('9')]);
    const store = await load();
    await store.hydrate();
    api.list.mockResolvedValueOnce([row('7')]);
    await store.hydrate();
    expect(store.list()).toEqual(['7']);
  });

  it('keeps demo walkers local (they have no account)', async () => {
    const store = await load();
    await store.add('sim_3', { name: 'Demo' });
    expect(api.block).not.toHaveBeenCalled();
    api.list.mockResolvedValue([row('7')]);
    await store.hydrate();
    expect(store.list()).toEqual(['7', 'sim_3']);
    await store.remove('sim_3');
    expect(api.unblock).not.toHaveBeenCalled();
  });
});
