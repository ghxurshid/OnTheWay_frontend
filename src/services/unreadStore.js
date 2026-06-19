/* SERVICE — unread message counts per contact/walker id (localStorage).
   Increments on incoming messages, clears when a chat opens.
   Emits 'ontheway:unread'. */

const UNREAD_KEY = 'ontheway_unread_v1';

export const unreadStore = {
  map: () => { try { return JSON.parse(localStorage.getItem(UNREAD_KEY) || '{}'); } catch { return {}; } },
  get: (id) => unreadStore.map()[id] || 0,
  total: () => Object.values(unreadStore.map()).reduce((a, b) => a + b, 0),
  add: (id, n = 1) => {
    const m = unreadStore.map();
    m[id] = (m[id] || 0) + n;
    localStorage.setItem(UNREAD_KEY, JSON.stringify(m));
    window.dispatchEvent(new Event('ontheway:unread'));
  },
  clear: (id) => {
    const m = unreadStore.map();
    if (m[id]) {
      delete m[id];
      localStorage.setItem(UNREAD_KEY, JSON.stringify(m));
      window.dispatchEvent(new Event('ontheway:unread'));
    }
  },
};
