/* ════════════════════════════════════════════════════════════════
   CHAT CLIENT — /hubs/chat (singleton).
   Realtime message delivery + typing indicators. Persistence and history
   live behind REST (chatApi); this only carries live traffic.
   ════════════════════════════════════════════════════════════════ */

import { createEmitter, createHubClient } from './hubConnection';

const events = createEmitter('chat');
const hub = createHubClient('/hubs/chat', (conn) => {
  conn.on('ReceiveMessage', (msg: unknown) => events.emit('ReceiveMessage', msg));
  conn.on('TypingIndicator', (fromUserId: string, isTyping: boolean) => events.emit('TypingIndicator', fromUserId, isTyping));
});

export const chatClient = {
  on: events.on,
  connect: hub.connect,
  disconnect: hub.disconnect,
  isConnected: hub.isConnected,

  /** Send a message to a recipient user id. */
  sendMessage(toUserId: string, content: string) {
    const c = hub.connected();
    return c ? c.invoke('SendMessage', toUserId, content) : Promise.reject(new Error('Chat hub not connected'));
  },

  sendTyping(toUserId: string, isTyping: boolean) {
    return hub.connected()?.invoke('SendTyping', toUserId, isTyping) ?? Promise.resolve();
  },
};
