/* SERVICE — contacts business logic. */

import { contactApi } from '@/api/contactApi';
import { isConflict } from '@/utils/errors';
import type { Contact } from '@/models';

/** Fetch all contacts. */
export function listContacts(): Promise<Contact[]> {
  return contactApi.list() as Promise<Contact[]>;
}

/** Save another user as a contact. Resolves 'already' when they were one. */
export async function addContact(contactUserId: string): Promise<'added' | 'already'> {
  try {
    await contactApi.add(contactUserId);
    return 'added';
  } catch (e) {
    if (isConflict(e)) return 'already';
    throw e;
  }
}

/** Remove a user from the caller's contacts (affects only the owner's list). */
export function removeContact(contactUserId: string) {
  return contactApi.remove(contactUserId);
}

/** Split contacts into online / offline buckets (presentation grouping). */
export function groupByPresence(contacts: Contact[]) {
  return {
    online: contacts.filter((c) => c.online),
    offline: contacts.filter((c) => !c.online),
  };
}
