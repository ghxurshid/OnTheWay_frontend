import { useCallback } from 'react';
import { useAsync } from './useAsync';
import { listHistory } from '@/services/historyService';

/** Loads trip history via the service layer. */
export function useHistory() {
  const loader = useCallback(() => listHistory(), []);
  const { data, loading, error, reload } = useAsync(loader, [], []);
  return { history: data || [], loading, error, reload };
}
