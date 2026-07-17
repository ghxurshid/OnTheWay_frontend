/* SERVICE — unread message counts per contact/walker id (localStorage).
   Increments on incoming messages, clears when a chat opens.
   Emits 'ontheway:unread'. */

const UNREAD_KEY = 'ontheway_unread_v1';

type UnreadMap = Record<string, number>;

export const unreadStore = {
  map: (): UnreadMap => { try { return JSON.parse(localStorage.getItem(UNREAD_KEY) || '{}'); } catch { return {}; } },
  get: (id: string): number => unreadStore.map()[id] || 0,
  total: (): number => Object.values(unreadStore.map()).reduce((a, b) => a + b, 0),
  add: (id: string, n = 1): void => {
    const m = unreadStore.map();
    m[id] = (m[id] || 0) + n;
    localStorage.setItem(UNREAD_KEY, JSON.stringify(m));
    window.dispatchEvent(new Event('ontheway:unread'));
  },
  clear: (id: string): void => {
    const m = unreadStore.map();
    if (m[id]) {
      delete m[id];
      localStorage.setItem(UNREAD_KEY, JSON.stringify(m));
      window.dispatchEvent(new Event('ontheway:unread'));
    }
  },
};
