import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiError } from '@/api/client';

const api = vi.hoisted(() => ({
  complete: vi.fn(), cancel: vi.fn(), hide: vi.fn(), show: vi.fn(),
}));
vi.mock('@/api/tripApi', () => ({ tripApi: api }));

// Errors come from the same (fresh) module graph as the outbox, or instanceof fails.
let Api: typeof ApiError;
const offline = () => new Api(0, 'Network request failed.', [], 'network');

/** A fresh module (its queue is loaded from storage on import). */
async function load() {
  vi.resetModules();
  Api = (await import('@/api/client')).ApiError;
  return (await import('./tripOutbox')).tripOutbox;
}

beforeEach(() => {
  localStorage.clear();
  Object.values(api).forEach((fn) => fn.mockReset().mockResolvedValue({}));
});

describe('trip outbox', () => {
  it('sends a command right away when online', async () => {
    const outbox = await load();

    await outbox.enqueue({ kind: 'cancel', tripId: '5' });

    expect(api.cancel).toHaveBeenCalledWith('5');
    expect(outbox.pending()).toEqual([]);
  });

  it('keeps a command made offline — across a restart — and sends it once back online', async () => {
    let outbox = await load();
    api.complete.mockRejectedValueOnce(offline());
    await outbox.enqueue({ kind: 'complete', tripId: '5', companionIds: ['9'] });
    expect(outbox.pending()).toHaveLength(1);

    outbox = await load(); // the app was closed and reopened
    await outbox.flush();

    expect(api.complete).toHaveBeenLastCalledWith('5', ['9']);
    expect(outbox.pending()).toEqual([]);
  });

  it('collapses per trip: the latest visibility wins, a close supersedes it', async () => {
    const outbox = await load();
    api.hide.mockRejectedValue(offline());
    api.show.mockRejectedValue(offline());
    api.cancel.mockRejectedValue(offline());

    await outbox.enqueue({ kind: 'hide', tripId: '5' });
    await outbox.enqueue({ kind: 'show', tripId: '5' });
    expect(outbox.pending()).toMatchObject([{ kind: 'show', tripId: '5' }]);

    await outbox.enqueue({ kind: 'cancel', tripId: '5' });
    await outbox.enqueue({ kind: 'hide', tripId: '5' }); // too late: the trip is closing
    expect(outbox.pending()).toMatchObject([{ kind: 'cancel', tripId: '5' }]);
  });

  it('drops a command the server refuses (e.g. the trip is closed already)', async () => {
    const outbox = await load();
    api.cancel.mockRejectedValue(new Api(409, 'Trip is already completed.'));
    api.hide.mockResolvedValue({});

    await outbox.enqueue({ kind: 'cancel', tripId: '5' });
    await outbox.enqueue({ kind: 'hide', tripId: '6' });

    expect(outbox.pending()).toEqual([]);
    expect(api.hide).toHaveBeenCalledWith('6');
  });

  it('a newer command queued while the older one is in flight is not lost', async () => {
    let finishHide!: () => void;
    api.hide.mockImplementationOnce(() => new Promise<void>((r) => { finishHide = r; }));
    const outbox = await load();

    const first = outbox.enqueue({ kind: 'hide', tripId: '5' });
    const second = outbox.enqueue({ kind: 'show', tripId: '5' }); // replaces the queued hide
    finishHide();
    await first;
    await second;
    await outbox.flush();

    expect(api.show).toHaveBeenCalledWith('5');
    expect(outbox.pending()).toEqual([]);
  });
});
