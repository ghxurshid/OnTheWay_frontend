/* SERVICE — saved places/routes/partners persistence (localStorage).
   Emits SAVED_EVENT so the useSaved hook can re-read. */

import type { SavedItem } from '@/models';
import { notifyStoreChange, readJson, writeJson } from '@/utils/storage';

const SAVED_KEY = 'ontheway_saved_v1';
export const SAVED_EVENT = 'ontheway:saved';

const save = (items: SavedItem[]): void => {
  writeJson(SAVED_KEY, items);
  notifyStoreChange(SAVED_EVENT);
};

export const savedStore = {
  list: (): SavedItem[] => readJson<SavedItem[]>(SAVED_KEY, []),
  has: (id: string): boolean => savedStore.list().some((p) => p.id === id),
  toggle: (place: SavedItem): void => {
    const cur = savedStore.list();
    save(cur.some((p) => p.id === place.id)
      ? cur.filter((p) => p.id !== place.id)
      : [{ ...place, savedAt: Date.now() }, ...cur]);
  },
  clear: (): void => save([]),
};
