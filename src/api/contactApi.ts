/* REPOSITORY — contacts. */

import { USE_MOCKS, mockResponse, http, send } from './client';
import { CONTACTS_DATA } from '@/mocks/contacts';

export const contactApi = {
  /** GET /contacts — saved contacts merged with live presence/location/route. */
  list() {
    if (USE_MOCKS) return mockResponse(CONTACTS_DATA);
    return http('/contacts').then((rows) => rows || []);
  },

  /** POST /contacts — save another user as a contact. */
  add(contactUserId: string) {
    if (USE_MOCKS) return mockResponse({ userId: contactUserId });
    return send('POST', '/contacts', { contactUserId });
  },

  /** DELETE /contacts/{contactUserId} — remove a user from the caller's contacts. */
  remove(contactUserId: string) {
    if (USE_MOCKS) return mockResponse(true);
    return send('DELETE', `/contacts/${contactUserId}`);
  },
};
