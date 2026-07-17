import { useState, useEffect } from 'react';
import { unreadStore } from '@/services/unreadStore';

/** Live map of unread counts; re-reads on the 'ontheway:unread' event. */
export function useUnread() {
  const [map, setMap] = useState(() => unreadStore.map());
  useEffect(() => {
    const h = () => setMap(unreadStore.map());
    window.addEventListener('ontheway:unread', h);
    return () => window.removeEventListener('ontheway:unread', h);
  }, []);
  return map;
}
