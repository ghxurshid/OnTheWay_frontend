/* REPOSITORY — contacts. */

import { USE_MOCKS, mockResponse, http } from './client';
import { CONTACTS_DATA } from '@/mocks/contacts';

export const contactApi = {
  /** GET /contacts — saved contacts merged with live presence/location/route. */
  list() {
    if (USE_MOCKS) return mockResponse(CONTACTS_DATA);
    return http('/contacts').then((rows) => rows || []);
  },

  /** Resolve one contact from the list (no dedicated backend route). */
  getById(id: string) {
    if (USE_MOCKS) return mockResponse(CONTACTS_DATA.find((c) => c.id === id) || null);
    return this.list().then((rows) => rows.find((c: { id: string }) => c.id === id) || null);
  },

  /** POST /contacts — save another user as a contact. */
  add(contactUserId: string) {
    if (USE_MOCKS) return mockResponse({ userId: contactUserId });
    return http('/contacts', {
      method: 'POST',
      body: JSON.stringify({ contactUserId }),
    });
  },

  /** DELETE /contacts/{contactUserId} — remove a user from the caller's contacts. */
  remove(contactUserId: string) {
    if (USE_MOCKS) return mockResponse(true);
    return http(`/contacts/${contactUserId}`, { method: 'DELETE' });
  },
};
