/* ════════════════════════════════════════════════════════════════
   BLOCK STORE — people the user blocked.
   ────────────────────────────────────────────────────────────────
   A block lives on the server (/blocks) and works both ways: the server
   keeps the two people off each other's map, lists, board, chat and
   calls. This store mirrors the list *I* made, so the UI can hide
   someone at once (map markers, list view, toasts) and Settings can
   undo it.

   - Hydrated from GET /blocks once signed in (and when Settings opens);
     cached in localStorage so a cold start is filtered before that.
   - `add` / `remove` are optimistic: the change shows at once, is sent,
     and is rolled back (the promise rejects) if the server refuses —
     the caller shows the localized error.
   - Demo mode, and simulated (non-numeric) ids, stay local only.
   - Ids are always strings.
   ════════════════════════════════════════════════════════════════ */

import { USE_MOCKS } from '@/api/client';
import { blocksApi } from '@/api/blocksApi';
import type { BlockedUser } from '@/api/blocksApi';
import { idOf, isRealUserId } from '@/utils/ids';
import { readJson, writeJson, notifyStoreChange } from '@/utils/storage';

export type { BlockedUser };

export const BLOCK_EVENT = 'ontheway:blocked';
const KEY = 'otw-blocked';

/** What the caller knows about the person at block time (shown until the server row arrives). */
export interface BlockInfo { name?: string | null; photoUrl?: string | null }

/** The cache may hold the older plain id list. */
function loadCache(): BlockedUser[] {
  const raw = readJson<unknown[]>(KEY, []);
  if (!Array.isArray(raw)) return [];
  const out: BlockedUser[] = [];
  for (const item of raw) {
    const row = typeof item === 'object' && item ? (item as Partial<BlockedUser>) : { userId: item as string };
    const userId = idOf(row.userId);
    if (userId && !out.some((x) => x.userId === userId)) {
      out.push({ userId, name: row.name || '', photoUrl: row.photoUrl || null, blockedAt: row.blockedAt || new Date(0).toISOString() });
    }
  }
  return out;
}

let entries: BlockedUser[] = loadCache();
let ids: string[] = entries.map((e) => e.userId); // stable between changes (useStoreEvent snapshot)

/** Ops sent but not yet answered, per user — re-applied over a server list
    that was read before they landed. */
const pending = new Map<string, 'add' | 'remove'>();
/** Latest op per user; an answer to an older one changes nothing. */
const version = new Map<string, number>();
/** Per-user request chain, so a block and an unblock reach the server in order. */
const chains = new Map<string, Promise<unknown>>();

function commit(next: BlockedUser[]): void {
  entries = next;
  ids = next.map((e) => e.userId);
  writeJson(KEY, next);
  notifyStoreChange(BLOCK_EVENT);
}

const bump = (id: string): number => {
  const v = (version.get(id) ?? 0) + 1;
  version.set(id, v);
  return v;
};

function enqueue<T>(id: string, run: () => Promise<T>): Promise<T> {
  const prev = chains.get(id);
  const next = prev ? prev.catch(() => undefined).then(run) : run();
  chains.set(id, next);
  const done = () => { if (chains.get(id) === next) chains.delete(id); };
  next.then(done, done);
  return next;
}

/** Only real users are blocked on the server; demo walkers stay local. */
const localOnly = (id: string): boolean => USE_MOCKS || !isRealUserId(id);

export const blockStore = {
  /** Blocked user ids (a stable array until the list changes). */
  list(): string[] { return ids; },
  /** The blocked people, newest first. */
  entries(): BlockedUser[] { return entries; },
  has(id: string | number | null | undefined): boolean { return id != null && ids.includes(String(id)); },

  /** Block `id`: hidden at once; rejects (and is undone) if the server refuses. */
  add(id: string | number, info: BlockInfo = {}): Promise<void> {
    const key = idOf(id);
    if (!key || blockStore.has(key)) return Promise.resolve();
    const v = bump(key);
    commit([{ userId: key, name: info.name || '', photoUrl: info.photoUrl || null, blockedAt: new Date().toISOString() }, ...entries]);
    if (localOnly(key)) return Promise.resolve();
    pending.set(key, 'add');
    return enqueue(key, () => blocksApi.block(key)).then((row) => {
      if (version.get(key) !== v) return;
      pending.delete(key);
      // Keep what the caller knew when the server row has no name/photo.
      commit(entries.map((e) => (e.userId === key
        ? { ...e, name: row.name || e.name, photoUrl: row.photoUrl || e.photoUrl, blockedAt: row.blockedAt || e.blockedAt } : e)));
    }, (err) => {
      if (version.get(key) !== v) return; // superseded by an unblock — nothing to undo
      pending.delete(key);
      commit(entries.filter((e) => e.userId !== key));
      throw err;
    });
  },

  /** Unblock `id`: shown again at once; rejects (and is undone) if the server refuses. */
  remove(id: string | number): Promise<void> {
    const key = idOf(id);
    const at = entries.findIndex((e) => e.userId === key);
    if (at < 0) return Promise.resolve();
    const before = entries[at];
    const v = bump(key);
    commit(entries.filter((e) => e.userId !== key));
    if (localOnly(key)) return Promise.resolve();
    pending.set(key, 'remove');
    return enqueue(key, () => blocksApi.unblock(key)).then(() => {
      if (version.get(key) === v) pending.delete(key);
    }, (err) => {
      if (version.get(key) !== v) return; // blocked again meanwhile — keep that
      pending.delete(key);
      const next = [...entries];
      next.splice(Math.min(at, next.length), 0, before);
      commit(next);
      throw err;
    });
  },

  /** Replace the list with the server's (GET /blocks). Whoever was blocked or
      unblocked here since the request left — still in flight, or answered
      while the list was on its way — keeps the local state: the snapshot may
      predate it. Local-only entries are kept. Demo mode: no-op. */
  async hydrate(): Promise<void> {
    if (USE_MOCKS) return;
    const before = new Map(version);
    const rows = await blocksApi.list();
    const touched = new Set([...pending.keys(), ...[...version.keys()].filter((id) => version.get(id) !== before.get(id))]);
    let next = rows.filter((r) => r.userId && !touched.has(r.userId));
    touched.forEach((id) => {
      const mine = entries.find((e) => e.userId === id);
      if (mine) next = [mine, ...next];
    });
    entries.filter((e) => !isRealUserId(e.userId) && !next.some((r) => r.userId === e.userId)).forEach((e) => { next = [...next, e]; });
    if (JSON.stringify(next) !== JSON.stringify(entries)) commit(next);
  },
};
