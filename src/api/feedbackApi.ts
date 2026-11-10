/* REPOSITORY — user feedback (/feedback). Suggestions, complaints and bug
   reports; read-only once submitted. A complaint about a person carries that
   person's id (`reportedUserId`). */

import { USE_MOCKS, mockResponse, http, send } from './client';

/** POST /feedback body. */
export interface FeedbackPayload {
  /** Backend FeedbackCategory: Suggestion / Complaint / BugReport. */
  category: string;
  title: string;
  description: string;
  appVersion?: string;
  attachmentUrl?: string;
  /** The person this report is about (a real user id), when there is one. */
  reportedUserId?: string;
}

export const feedbackApi = {
  /** GET /feedback — the caller's submitted feedback. */
  list() {
    if (USE_MOCKS) return mockResponse([]);
    return http('/feedback').then((rows) =>
      (rows || []).map((f: { createdAt: string }) => ({ ...f, createdAt: new Date(f.createdAt) })));
  },

  /** POST /feedback — submit new feedback. */
  submit(payload: FeedbackPayload) {
    if (USE_MOCKS) return mockResponse({ id: 'fb_' + Date.now(), ...payload, createdAt: new Date() });
    return send('POST', '/feedback', payload);
  },
};
