import { useCallback } from 'react';
import { useAsync } from './useAsync';
import { listWalkers } from '@/services/walkerService';

/** Loads the opposite-role planned trips via the service layer. Pass the
    caller's own search role; reloads if it changes. */
export function useWalkers(role?: string) {
  const loader = useCallback(() => listWalkers(role), [role]);
  const { data, loading, error, reload } = useAsync(loader, [role], []);
  return { walkers: data || [], loading, error, reload };
}
