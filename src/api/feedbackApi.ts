/* REPOSITORY — user feedback (/feedback). Suggestions, complaints and bug
   reports; read-only once submitted. */

import { USE_MOCKS, mockResponse, http } from './client';

export const feedbackApi = {
  /** GET /feedback — the caller's submitted feedback. */
  list() {
    if (USE_MOCKS) return mockResponse([]);
    return http('/feedback').then((rows) =>
      (rows || []).map((f: { createdAt: string }) => ({ ...f, createdAt: new Date(f.createdAt) })));
  },

  /** POST /feedback — submit new feedback.
      payload: { category, title, description, appVersion?, attachmentUrl? } */
  submit(payload: Record<string, unknown>) {
    if (USE_MOCKS) return mockResponse({ id: 'fb_' + Date.now(), ...payload, createdAt: new Date() });
    return http('/feedback', { method: 'POST', body: JSON.stringify(payload) });
  },
};
