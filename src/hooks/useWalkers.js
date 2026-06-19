import { useCallback } from 'react';
import { useAsync } from './useAsync';
import { listWalkers } from '@/services/walkerService';

/** Loads all scheduled walkers via the service layer. */
export function useWalkers() {
  const loader = useCallback(() => listWalkers(), []);
  const { data, loading, error, reload } = useAsync(loader, [], []);
  return { walkers: data || [], loading, error, reload };
}
