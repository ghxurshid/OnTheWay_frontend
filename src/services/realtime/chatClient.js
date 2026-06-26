/* ════════════════════════════════════════════════════════════════
   CHAT CLIENT — /hubs/chat (singleton).
   Realtime message delivery + typing indicators. Persistence and history
   live behind REST (chatApi); this only carries live traffic.
   ════════════════════════════════════════════════════════════════ */

import { createHubConnection, startConnection } from './hubConnection';

const EVENTS = ['ReceiveMessage', 'TypingIndicator'];

let connection = null;
const listeners = new Map();

function emit(event, ...args) {
  listeners.get(event)?.forEach((fn) => {
    try { fn(...args); } catch (e) { console.error(`[chat] ${event} handler`, e); }
  });
}

function ensureConnection() {
  if (connection) return connection;
  connection = createHubConnection('/hubs/chat');
  connection.on('ReceiveMessage', (msg) => emit('ReceiveMessage', msg));
  connection.on('TypingIndicator', (fromUserId, isTyping) => emit('TypingIndicator', fromUserId, isTyping));
  return connection;
}

export const chatClient = {
  on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
    return () => listeners.get(event)?.delete(handler);
  },

  async connect() {
    await startConnection(ensureConnection());
  },

  async disconnect() {
    if (connection) { try { await connection.stop(); } catch { /* ignore */ } }
    connection = null;
  },

  isConnected() {
    return connection?.state === 'Connected';
  },

  /** Send a message to a recipient user id (Guid string). */
  sendMessage(toUserId, content) {
    if (this.isConnected()) return connection.invoke('SendMessage', toUserId, content);
    return Promise.reject(new Error('Chat hub not connected'));
  },

  sendTyping(toUserId, isTyping) {
    if (this.isConnected()) return connection.invoke('SendTyping', toUserId, isTyping);
    return Promise.resolve();
  },
};

// Re-export for symmetry with the other event names.
export { EVENTS as CHAT_EVENTS };
