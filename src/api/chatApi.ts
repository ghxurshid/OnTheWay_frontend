/* REPOSITORY — chat (REST). Realtime send/receive goes over the ChatHub;
   these endpoints serve the inbox, the thread with one user (paged, newest
   first), read receipts, and a send fallback when the socket is down. */

import { USE_MOCKS, mockResponse, http, send } from './client';

/** One inbox row (ids are strings on the wire). */
export interface ConversationRow {
  id: string;
  otherParticipantId: string;
  otherParticipantName?: string | null;
  otherParticipantKind?: string | null;
  lastMessage?: string | null;
  lastMessageSenderId?: string | null;
  lastMessageAtUtc?: string | null;
  unreadCount: number;
}

/** A persisted message as the API and ChatHub deliver it. */
export interface ChatMessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  sentAtUtc: string;
  isRead?: boolean;
  senderName?: string | null;
}

export interface MessagePage { items: ChatMessageDto[]; hasNextPage: boolean }

export const chatApi = {
  /** GET /chat/conversations — the caller's inbox, most recent first. */
  conversations(pageNumber = 1, pageSize = 30): Promise<ConversationRow[]> {
    if (USE_MOCKS) return mockResponse([]);
    return http(`/chat/conversations?pageNumber=${pageNumber}&pageSize=${pageSize}`)
      .then((p) => p?.items || []);
  },

  /** GET /chat/with/:userId/messages — one page of the thread with a user (newest first). */
  withUser(userId: string, pageNumber = 1, pageSize = 30): Promise<MessagePage> {
    if (USE_MOCKS) return mockResponse({ items: [], hasNextPage: false });
    return http(`/chat/with/${userId}/messages?pageNumber=${pageNumber}&pageSize=${pageSize}`)
      .then((d) => ({ items: d?.messages?.items || [], hasNextPage: !!d?.messages?.hasNextPage }));
  },

  /** POST /chat/with/:userId/read — mark everything they sent me as read. */
  markRead(userId: string): Promise<unknown> {
    if (USE_MOCKS) return mockResponse(0);
    return send('POST', `/chat/with/${userId}/read`);
  },

  /** POST /chat/messages — REST send (the server still delivers it live). */
  send(recipientId: string, content: string): Promise<ChatMessageDto | null> {
    if (USE_MOCKS) return mockResponse(null);
    return send('POST', '/chat/messages', { recipientId, content });
  },
};
