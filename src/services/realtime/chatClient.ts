/* ════════════════════════════════════════════════════════════════
   CHAT CLIENT — /hubs/chat (singleton).
   Realtime message delivery, typing indicators and receipts (✓✓ delivered /
   read). Persistence and history live behind REST (chatApi); this only
   carries live traffic.
   ════════════════════════════════════════════════════════════════ */

import { createEmitter, createHubClient } from './hubConnection';

const events = createEmitter('chat');
const hub = createHubClient('/hubs/chat', (conn) => {
  conn.on('ReceiveMessage', (msg: unknown) => events.emit('ReceiveMessage', msg));
  conn.on('TypingIndicator', (fromUserId: string, isTyping: boolean) => events.emit('TypingIndicator', fromUserId, isTyping));
  conn.on('MessagesDelivered', (receipt: unknown) => events.emit('MessagesDelivered', receipt));
  conn.on('MessagesRead', (receipt: unknown) => events.emit('MessagesRead', receipt));
});

export const chatClient = {
  on: events.on,
  connect: hub.connect,
  disconnect: hub.disconnect,
  isConnected: hub.isConnected,
  /** Fires after the socket came back — time to resync what was missed. */
  onReconnected: hub.onReconnected,

  /** Send a message to a recipient user id. */
  sendMessage(toUserId: string, content: string) {
    const c = hub.connected();
    return c ? c.invoke('SendMessage', toUserId, content) : Promise.reject(new Error('Chat hub not connected'));
  },

  sendTyping(toUserId: string, isTyping: boolean) {
    return hub.connected()?.invoke('SendTyping', toUserId, isTyping) ?? Promise.resolve();
  },

  /** Acknowledge that this device received `fromUserId`'s messages up to
      `upToMessageId` (the sender's ✓✓). Skipped while offline — the server
      settles the backlog when this user connects again. */
  markDelivered(fromUserId: string, upToMessageId: string) {
    return hub.connected()?.invoke('MarkDelivered', fromUserId, upToMessageId) ?? Promise.resolve();
  },
};
