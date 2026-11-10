import { useCallback } from 'react';
import { useAsync } from './useAsync';
import { listContacts } from '@/services/contactService';
import type { Contact } from '@/models';

/** Loads all contacts via the service layer. */
export function useContacts() {
  const loader = useCallback(() => listContacts() as Promise<Contact[]>, []);
  const { data, loading, error, reload } = useAsync<Contact[]>(loader, [], []);
  return { contacts: data || [], loading, error, reload };
}
