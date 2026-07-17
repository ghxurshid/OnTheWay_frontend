import { useCallback } from 'react';
import { useAsync } from './useAsync';
import { listContacts } from '@/services/contactService';

/** Loads all contacts via the service layer. */
export function useContacts() {
  const loader = useCallback(() => listContacts(), []);
  const { data, loading, error, reload } = useAsync(loader, [], []);
  return { contacts: data || [], loading, error, reload };
}
