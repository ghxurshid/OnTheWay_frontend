import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiError } from '@/api/client';

const api = vi.hoisted(() => ({
  complete: vi.fn(), cancel: vi.fn(), hide: vi.fn(), show: vi.fn(),
}));
vi.mock('@/api/tripApi', () => ({ tripApi: api }));
const ratings = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock('@/api/ratingsApi', () => ({ ratingsApi: ratings }));
// The presence hub's "(re)connected" step is the outbox's cue too.
const hub = vi.hoisted(() => ({ steps: [] as Array<(conn: unknown) => Promise<void>> }));
vi.mock('@/services/realtime', () => ({
  presenceClient: { onResync: (step: (conn: unknown) => Promise<void>) => { hub.steps.push(step); return () => {}; } },
}));

// Errors come from the same (fresh) module graph as the outbox, or instanceof fails.
let Api: typeof ApiError;
const offline = () => new Api(0, 'Network request failed.', [], 'network');

/** A fresh module (its queue is loaded from storage on import). */
async function load() {
  vi.resetModules();
  hub.steps.length = 0;
  Api = (await import('@/api/client')).ApiError;
  return (await import('./tripOutbox')).tripOutbox;
}

beforeEach(() => {
  localStorage.clear();
  Object.values(api).forEach((fn) => fn.mockReset().mockResolvedValue({}));
  ratings.submit.mockReset().mockResolvedValue({});
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

  // --- rating the companion ------------------------------------------------

  it('a rating waits for its trip\'s completion and is sent right after it, in order', async () => {
    const order: string[] = [];
    const outbox = await load();
    api.complete.mockRejectedValue(offline());

    await outbox.enqueue({ kind: 'complete', tripId: '5', companionIds: ['9'] }); // offline
    await outbox.enqueue({ kind: 'rate', tripId: '5', rateeId: '9', stars: 5, tags: ['tagOnTime', 'tagPolite'] });
    expect(ratings.submit).not.toHaveBeenCalled(); // blocked behind the unsent completion
    expect(outbox.pending().map((c) => c.kind)).toEqual(['complete', 'rate']);

    api.complete.mockImplementation(() => { order.push('complete'); return Promise.resolve({}); });
    ratings.submit.mockImplementation(() => { order.push('rate'); return Promise.resolve({}); });
    await outbox.flush();

    expect(order).toEqual(['complete', 'rate']);
    expect(ratings.submit).toHaveBeenCalledWith({ tripId: '5', rateeId: '9', stars: 5, tags: ['tagOnTime', 'tagPolite'] });
    expect(outbox.pending()).toEqual([]);
  });

  it('a rating on the other person\'s trip (no close of mine queued) goes out right away', async () => {
    const outbox = await load();
    await outbox.enqueue({ kind: 'rate', tripId: '501', rateeId: '7', stars: 5, tags: ['tagSafe'] });
    expect(ratings.submit).toHaveBeenCalledWith({ tripId: '501', rateeId: '7', stars: 5, tags: ['tagSafe'] });
    expect(api.complete).not.toHaveBeenCalled();
    expect(outbox.pending()).toEqual([]);
  });

  it('a close queued after a rating still runs first, and never drops the rating', async () => {
    const outbox = await load();
    api.hide.mockRejectedValue(offline());
    api.complete.mockRejectedValue(offline());

    await outbox.enqueue({ kind: 'hide', tripId: '5' }); // offline: stays at the head
    await outbox.enqueue({ kind: 'rate', tripId: '5', rateeId: '9', stars: 4, tags: [] });
    await outbox.enqueue({ kind: 'complete', tripId: '5', companionIds: ['9'] }); // replaces the hide

    expect(outbox.pending().map((c) => c.kind)).toEqual(['complete', 'rate']);
  });

  it('one rating per person and trip — the latest wins', async () => {
    const outbox = await load();
    api.complete.mockRejectedValue(offline());

    await outbox.enqueue({ kind: 'complete', tripId: '5', companionIds: ['9', '10'] });
    await outbox.enqueue({ kind: 'rate', tripId: '5', rateeId: '9', stars: 3, tags: [] });
    await outbox.enqueue({ kind: 'rate', tripId: '5', rateeId: '10', stars: 5, tags: [] });
    await outbox.enqueue({ kind: 'rate', tripId: '5', rateeId: '9', stars: 4, tags: ['tagSafe'] });

    expect(outbox.pending()).toMatchObject([
      { kind: 'complete' },
      { kind: 'rate', rateeId: '10', stars: 5 },
      { kind: 'rate', rateeId: '9', stars: 4 },
    ]);
  });

  it('already rated (409) counts as done; not allowed (403/404) is dropped; offline is kept', async () => {
    const outbox = await load();
    ratings.submit
      .mockRejectedValueOnce(new Api(409, 'Already rated.'))
      .mockRejectedValueOnce(new Api(403, 'Not a companion.'))
      .mockRejectedValueOnce(new Api(404, 'Trip not found.'))
      .mockRejectedValueOnce(offline());

    await outbox.enqueue({ kind: 'rate', tripId: '1', rateeId: '9', stars: 5, tags: [] });
    await outbox.enqueue({ kind: 'rate', tripId: '2', rateeId: '9', stars: 5, tags: [] });
    await outbox.enqueue({ kind: 'rate', tripId: '3', rateeId: '9', stars: 5, tags: [] });
    expect(outbox.pending()).toEqual([]);

    await outbox.enqueue({ kind: 'rate', tripId: '4', rateeId: '9', stars: 5, tags: [] });
    expect(outbox.pending()).toMatchObject([{ kind: 'rate', tripId: '4' }]);
  });

  // --- getting it out when "online" never fires (a proxy cuts the network) ---------

  it('sends what waited as soon as the realtime connection is back', async () => {
    const outbox = await load();
    api.complete.mockRejectedValue(offline());
    await outbox.enqueue({ kind: 'complete', tripId: '5', companionIds: [] });
    await outbox.enqueue({ kind: 'rate', tripId: '5', rateeId: '9', stars: 5, tags: [] });
    expect(outbox.pending()).toHaveLength(2);

    api.complete.mockResolvedValue({}); // the network works again; "online" never fired
    for (const step of hub.steps) await step({});
    await outbox.flush(); // the step does not wait for REST: let the started flush finish

    expect(api.complete).toHaveBeenLastCalledWith('5', []);
    expect(ratings.submit).toHaveBeenCalledTimes(1);
    expect(outbox.pending()).toEqual([]);
  });

  it('keeps retrying with a backoff while something is waiting', async () => {
    vi.useFakeTimers();
    try {
      const outbox = await load();
      api.cancel.mockRejectedValueOnce(offline()).mockRejectedValueOnce(offline());
      await outbox.enqueue({ kind: 'cancel', tripId: '5' });
      expect(api.cancel).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(2_000);
      expect(api.cancel).toHaveBeenCalledTimes(2); // still offline
      await vi.advanceTimersByTimeAsync(5_000);
      expect(api.cancel).toHaveBeenCalledTimes(3);
      expect(outbox.pending()).toEqual([]);

      await vi.advanceTimersByTimeAsync(120_000);
      expect(api.cancel).toHaveBeenCalledTimes(3); // nothing waits: no more timers
    } finally {
      vi.useRealTimers();
    }
  });
});
