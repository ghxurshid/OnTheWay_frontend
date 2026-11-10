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
  lastMessageId?: string | null;
  /** Receipt times of the latest message (drives the ✓✓ when it is mine). */
  lastMessageDeliveredAtUtc?: string | null;
  lastMessageReadAtUtc?: string | null;
  unreadCount: number;
}

/** A persisted message as the API and ChatHub deliver it (receipt times null
    until the recipient's device got it / they saw it). */
export interface ChatMessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  sentAtUtc: string;
  isRead?: boolean;
  deliveredAtUtc?: string | null;
  readAtUtc?: string | null;
  senderName?: string | null;
  /** The sending device's own id for the message (echoed back to settle it). */
  clientMessageId?: string | null;
}

/** ChatHub MessagesDelivered / MessagesRead: `byUserId` received / read every
    message `senderId` sent in the conversation up to `upToMessageId`. */
export interface MessageReceipt {
  conversationId: string;
  senderId: string;
  byUserId: string;
  upToMessageId: string;
  count: number;
  atUtc: string;
}

export interface MessagePage { items: ChatMessageDto[]; hasNextPage: boolean }

// Demo mode: messages the simulation "received", so the inbox lists the same
// conversations the unread badges count.
const MOCK_INBOX = new Map<string, ConversationRow>();

/** Demo only: record an incoming message in the mock inbox. */
export function recordMockIncoming(from: { id: string; name: string; type?: string }, content: string): void {
  const id = String(from.id);
  const prev = MOCK_INBOX.get(id);
  MOCK_INBOX.delete(id);
  MOCK_INBOX.set(id, {
    id: 'conv_' + id, otherParticipantId: id, otherParticipantName: from.name,
    otherParticipantKind: from.type === 'driver' ? 'Driver' : 'Passenger',
    lastMessage: content, lastMessageSenderId: id, lastMessageAtUtc: new Date().toISOString(),
    lastMessageId: 'm_' + Date.now(), unreadCount: (prev?.unreadCount || 0) + 1,
  });
}

/** Demo only: the thread with `userId` was opened — its messages are read. */
export function markMockRead(userId: string): void {
  const row = MOCK_INBOX.get(String(userId));
  if (row) row.unreadCount = 0;
}

export const chatApi = {
  /** GET /chat/conversations — the caller's inbox, most recent first. */
  conversations(pageNumber = 1, pageSize = 30): Promise<ConversationRow[]> {
    if (USE_MOCKS) return mockResponse([...MOCK_INBOX.values()].reverse());
    return http(`/chat/conversations?pageNumber=${pageNumber}&pageSize=${pageSize}`)
      .then((p) => p?.items || []);
  },

  /** GET /chat/with/:userId/messages — one page of the thread with a user (newest first). */
  withUser(userId: string, pageNumber = 1, pageSize = 30): Promise<MessagePage> {
    if (USE_MOCKS) return mockResponse({ items: [], hasNextPage: false });
    return http(`/chat/with/${userId}/messages?pageNumber=${pageNumber}&pageSize=${pageSize}`)
      .then((d) => ({ items: d?.messages?.items || [], hasNextPage: !!d?.messages?.hasNextPage }));
  },

  /** POST /chat/with/:userId/read — mark what they sent me as read: everything,
      or up to `upToMessageId` (the newest one on screen). The sender gets a
      read receipt over the ChatHub. */
  markRead(userId: string, upToMessageId?: string): Promise<unknown> {
    if (USE_MOCKS) return mockResponse(0);
    const query = upToMessageId ? `?upToMessageId=${encodeURIComponent(upToMessageId)}` : '';
    return send('POST', `/chat/with/${userId}/read${query}`);
  },

  /** POST /chat/messages — REST send (the server still delivers it live). The
      same `clientMessageId` as a failed socket attempt makes the retry idempotent. */
  send(recipientId: string, content: string, clientMessageId?: string): Promise<ChatMessageDto | null> {
    if (USE_MOCKS) return mockResponse(null);
    return send('POST', '/chat/messages', { recipientId, content, clientMessageId });
  },
};
