/* SERVICE — saved places/routes/partners persistence (localStorage).
   Emits 'ontheway:saved' so the useSaved hook can re-read. */

import type { SavedItem } from '@/models';

const SAVED_KEY = 'ontheway_saved_v1';

export const savedStore = {
  list: (): SavedItem[] => { try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch { return []; } },
  has: (id: string): boolean => savedStore.list().some((p) => p.id === id),
  toggle: (place: SavedItem): void => {
    const cur = savedStore.list();
    const exists = cur.find((p) => p.id === place.id);
    const next = exists
      ? cur.filter((p) => p.id !== place.id)
      : [{ ...place, savedAt: Date.now() }, ...cur];
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('ontheway:saved'));
  },
  clear: (): void => {
    localStorage.setItem(SAVED_KEY, '[]');
    window.dispatchEvent(new Event('ontheway:saved'));
  },
};
