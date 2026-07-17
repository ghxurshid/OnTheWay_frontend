import { useState, useEffect } from 'react';
import { savedStore } from '@/services/savedStore';

/** Live list of saved items; re-reads on the 'ontheway:saved' event. */
export function useSaved() {
  const [list, setList] = useState(() => savedStore.list());
  useEffect(() => {
    const h = () => setList(savedStore.list());
    window.addEventListener('ontheway:saved', h);
    return () => window.removeEventListener('ontheway:saved', h);
  }, []);
  return list;
}
