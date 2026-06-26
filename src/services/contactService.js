/* SERVICE — contacts business logic. */

import { contactApi } from '@/api/contactApi';

/** Fetch all contacts. */
export function listContacts() {
  return contactApi.list();
}

/** Split contacts into online / offline buckets (presentation grouping). */
export function groupByPresence(contacts) {
  return {
    online: contacts.filter((c) => c.online),
    offline: contacts.filter((c) => !c.online),
  };
}
