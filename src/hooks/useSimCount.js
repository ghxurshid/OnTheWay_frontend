import { useState, useEffect } from 'react';
import { simStore } from '@/services/simStore';

/** [n, setN] for the simulated-walker count; syncs on 'ontheway:simcount'. */
export function useSimCount() {
  const [n, setN] = useState(() => simStore.get());
  useEffect(() => {
    const h = () => setN(simStore.get());
    window.addEventListener('ontheway:simcount', h);
    return () => window.removeEventListener('ontheway:simcount', h);
  }, []);
  return [n, simStore.set];
}
