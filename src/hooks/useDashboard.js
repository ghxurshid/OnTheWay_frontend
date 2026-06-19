import { useCallback } from 'react';
import { useAsync } from './useAsync';
import { getDashboardSummary } from '@/services/dashboardService';

/** Loads dashboard analytics via the service layer. */
export function useDashboard() {
  const loader = useCallback(() => getDashboardSummary(), []);
  const { data, loading, error, reload } = useAsync(loader, [], null);
  return { summary: data, loading, error, reload };
}
