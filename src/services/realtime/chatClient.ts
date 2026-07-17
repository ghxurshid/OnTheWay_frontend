/* ════════════════════════════════════════════════════════════════
   CHAT CLIENT — /hubs/chat (singleton).
   Realtime message delivery + typing indicators. Persistence and history
   live behind REST (chatApi); this only carries live traffic.
   ════════════════════════════════════════════════════════════════ */

import type { HubConnection } from '@microsoft/signalr';
import { createHubConnection, startConnection } from './hubConnection';

const EVENTS = ['ReceiveMessage', 'TypingIndicator'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (...args: any[]) => void;

let connection: HubConnection | null = null;
const listeners = new Map<string, Set<Handler>>();

function emit(event: string, ...args: unknown[]) {
  listeners.get(event)?.forEach((fn) => {
    try { fn(...args); } catch (e) { console.error(`[chat] ${event} handler`, e); }
  });
}

function ensureConnection(): HubConnection {
  if (connection) return connection;
  const conn = createHubConnection('/hubs/chat');
  connection = conn;
  conn.on('ReceiveMessage', (msg: unknown) => emit('ReceiveMessage', msg));
  conn.on('TypingIndicator', (fromUserId: string, isTyping: boolean) => emit('TypingIndicator', fromUserId, isTyping));
  return conn;
}

const connected = (): HubConnection | null => (connection && connection.state === 'Connected' ? connection : null);

export const chatClient = {
  on(event: string, handler: Handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(handler);
    return () => listeners.get(event)?.delete(handler);
  },

  async connect() {
    await startConnection(ensureConnection());
  },

  async disconnect() {
    if (connection) { try { await connection.stop(); } catch { /* ignore */ } }
    connection = null;
  },

  isConnected(): boolean {
    return connection?.state === 'Connected';
  },

  /** Send a message to a recipient user id (Guid string). */
  sendMessage(toUserId: string, content: string) {
    const c = connected();
    if (c) return c.invoke('SendMessage', toUserId, content);
    return Promise.reject(new Error('Chat hub not connected'));
  },

  sendTyping(toUserId: string, isTyping: boolean) {
    return connected()?.invoke('SendTyping', toUserId, isTyping) ?? Promise.resolve();
  },
};

// Re-export for symmetry with the other event names.
export { EVENTS as CHAT_EVENTS };
