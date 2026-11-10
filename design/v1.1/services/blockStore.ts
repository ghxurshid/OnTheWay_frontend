/* BLOCK STORE — people the user chose not to see (hidden from the map, lists
   and toasts). Local and reversible; persisted in localStorage. */

import { readJson, writeJson, notifyStoreChange } from '@/utils/storage';

export const BLOCK_EVENT = 'ontheway:blocked';
const KEY = 'otw-blocked';

let ids: string[] = readJson<string[]>(KEY, []);

export const blockStore = {
  list(): string[] { return ids; },
  has(id: string | number | null | undefined): boolean { return id != null && ids.includes(String(id)); },
  add(id: string | number): void {
    if (blockStore.has(id)) return;
    ids = [...ids, String(id)];
    writeJson(KEY, ids);
    notifyStoreChange(BLOCK_EVENT);
  },
  remove(id: string | number): void {
    ids = ids.filter((x) => x !== String(id));
    writeJson(KEY, ids);
    notifyStoreChange(BLOCK_EVENT);
  },
};
