import { useCallback } from 'react';
import { useAsync } from './useAsync';
import { listWalkers } from '@/services/walkerService';

/** Loads the planned trips of both roles via the service layer. The caller's
    own search role is still passed (harmless); reloads if it changes. */
export function useWalkers(role?: string) {
  const loader = useCallback(() => listWalkers(role), [role]);
  const { data, loading, error, reload } = useAsync(loader, [role], []);
  return { walkers: data || [], loading, error, reload };
}
