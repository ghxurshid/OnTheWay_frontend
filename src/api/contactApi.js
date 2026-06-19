/* REPOSITORY — contacts. */

import { USE_MOCKS, mockResponse, http } from './client';
import { CONTACTS_DATA } from '@/mocks/contacts';

export const contactApi = {
  /** GET /contacts */
  list() {
    if (USE_MOCKS) return mockResponse(CONTACTS_DATA);
    return http('/contacts');
  },

  /** GET /contacts/:id */
  getById(id) {
    if (USE_MOCKS) return mockResponse(CONTACTS_DATA.find((c) => c.id === id) || null);
    return http(`/contacts/${id}`);
  },
};
