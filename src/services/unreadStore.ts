/* SERVICE — unread message counts per contact/walker id (localStorage).
   Increments on incoming messages, clears when a chat opens.
   Emits UNREAD_EVENT. */

import { notifyStoreChange, readJson, writeJson } from '@/utils/storage';

const UNREAD_KEY = 'ontheway_unread_v1';
export const UNREAD_EVENT = 'ontheway:unread';

type UnreadMap = Record<string, number>;

const save = (m: UnreadMap): void => {
  writeJson(UNREAD_KEY, m);
  notifyStoreChange(UNREAD_EVENT);
};

export const unreadStore = {
  map: (): UnreadMap => readJson<UnreadMap>(UNREAD_KEY, {}),
  get: (id: string): number => unreadStore.map()[id] || 0,
  total: (): number => Object.values(unreadStore.map()).reduce((a, b) => a + b, 0),
  add: (id: string, n = 1): void => {
    const m = unreadStore.map();
    m[id] = (m[id] || 0) + n;
    save(m);
  },
  clear: (id: string): void => {
    const m = unreadStore.map();
    if (!m[id]) return;
    delete m[id];
    save(m);
  },
};
