import { useCallback } from 'react';
import { useAsync } from './useAsync';
import { listHistory } from '@/services/historyService';
import type { Trip } from '@/models';

/** Loads trip history via the service layer. */
export function useHistory() {
  const loader = useCallback(() => listHistory() as Promise<Trip[]>, []);
  const { data, loading, error, reload } = useAsync<Trip[]>(loader, [], []);
  return { history: data || [], loading, error, reload };
}
