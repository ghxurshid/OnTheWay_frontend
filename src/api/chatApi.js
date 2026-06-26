/* REPOSITORY — chat history (REST). Realtime send/receive goes over the
   ChatHub; these endpoints back-fill history and provide a non-realtime
   send fallback. All list endpoints unwrap PaginatedList → items. */

import { USE_MOCKS, mockResponse, http } from './client';

export const chatApi = {
  /** GET /chat/conversations — the caller's conversations. */
  conversations(pageNumber = 1, pageSize = 20) {
    if (USE_MOCKS) return mockResponse([]);
    return http(`/chat/conversations?pageNumber=${pageNumber}&pageSize=${pageSize}`)
      .then((p) => p?.items || []);
  },

  /** GET /chat/conversations/:id/messages — message history (oldest→newest). */
  messages(conversationId, pageNumber = 1, pageSize = 30) {
    if (USE_MOCKS) return mockResponse([]);
    return http(`/chat/conversations/${conversationId}/messages?pageNumber=${pageNumber}&pageSize=${pageSize}`)
      .then((p) => p?.items || []);
  },

  /** POST /chat/messages — REST fallback when the hub is unavailable. */
  send(recipientId, content) {
    if (USE_MOCKS) return mockResponse(null);
    return http('/chat/messages', {
      method: 'POST',
      body: JSON.stringify({ recipientId, content }),
    });
  },
};
