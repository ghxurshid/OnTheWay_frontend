import { useCallback } from 'react';
import { useAsync } from './useAsync';
import { getDashboardSummary } from '@/services/dashboardService';
import type { DashboardSummary } from '@/models';

/** Loads dashboard analytics via the service layer. */
export function useDashboard() {
  const loader = useCallback(() => getDashboardSummary() as Promise<DashboardSummary>, []);
  const { data, loading, error, reload } = useAsync<DashboardSummary>(loader, [], null);
  return { summary: data, loading, error, reload };
}
