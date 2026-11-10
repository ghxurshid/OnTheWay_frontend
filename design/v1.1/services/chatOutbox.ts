/* ════════════════════════════════════════════════════════════════
   SERVICE — the chat outbox: every message I write, from the tap on "send"
   until the server has stored it. Persisted (localStorage), so a message
   written offline survives leaving the chat or closing the app, and is sent
   — oldest first — as soon as the connection is back.

   Each item carries a device-generated id (`clientId`) that goes with every
   attempt (socket, then REST): the server stores a message once per id, so a
   retry after a lost acknowledgement can never post it twice (Telegram's
   random_id, Matrix's transaction id). Outcomes are announced to the open
   chat through `on('settled' | 'failed')`.
   ════════════════════════════════════════════════════════════════ */

import { chatApi } from '@/api/chatApi';
import type { ChatMessageDto } from '@/api/chatApi';
import { chatClient } from '@/services/realtime/chatClient';
import { createEmitter } from '@/services/realtime/hubConnection';
import { isConflict, isNetworkError } from '@/utils/errors';
import { newClientId } from '@/utils/ids';
import { readJson, writeJson } from '@/utils/storage';

const KEY = 'ontheway_chat_outbox_v1';

export interface OutboxItem {
  clientId: string;
  toUserId: string;
  text: string;
  /** Written at (epoch ms). */
  at: number;
  /** The server refused it (not a network problem): shown with "resend". */
  failed?: boolean;
}

let items: OutboxItem[] = readJson<OutboxItem[]>(KEY, []);
const inFlight = new Set<string>();
const events = createEmitter('chatOutbox');

const save = () => writeJson(KEY, items.length ? items : null);
const remove = (clientId: string) => { items = items.filter((i) => i.clientId !== clientId); save(); };
const markFailed = (clientId: string) => {
  items = items.map((i) => (i.clientId === clientId ? { ...i, failed: true } : i));
  save();
};

/** One delivery attempt: the socket first, REST when the socket is down. */
async function deliver(item: OutboxItem): Promise<void> {
  if (inFlight.has(item.clientId)) return;
  inFlight.add(item.clientId);
  try {
    let saved: ChatMessageDto | null;
    try {
      saved = await chatClient.sendMessage(item.toUserId, item.text, item.clientId);
    } catch {
      saved = await chatApi.send(item.toUserId, item.text, item.clientId);
    }
    remove(item.clientId);
    events.emit('settled', item, saved);
  } catch (e) {
    if (isConflict(e)) {
      // A racing attempt stored it already: it is sent.
      remove(item.clientId);
      events.emit('settled', item, null);
    } else if (!isNetworkError(e)) {
      markFailed(item.clientId);
      events.emit('failed', item);
    } // offline: stays queued for the next flush
  } finally {
    inFlight.delete(item.clientId);
  }
}

let flushing: Promise<void> | null = null;

export const chatOutbox = {
  /** Subscribe to 'settled' (item, savedMessage | null) or 'failed' (item). */
  on: events.on,

  /** Messages to `userId` the server does not have yet, oldest first. */
  pendingFor: (userId: string): OutboxItem[] => items.filter((i) => i.toUserId === userId),

  /** Queue a message and try to send it right away. */
  send(toUserId: string, text: string): OutboxItem {
    const item: OutboxItem = { clientId: newClientId(), toUserId, text, at: Date.now() };
    items = [...items, item];
    save();
    deliver(item);
    return item;
  },

  /** "Resend" on a failed message. */
  retry(clientId: string): void {
    const item = items.find((i) => i.clientId === clientId);
    if (!item) return;
    items = items.map((i) => (i.clientId === clientId ? { ...i, failed: false } : i));
    save();
    deliver({ ...item, failed: false });
  },

  /** Send everything still waiting (not the refused ones), oldest first. */
  flush(): Promise<void> {
    if (!flushing) {
      flushing = (async () => {
        for (const item of items.filter((i) => !i.failed)) {
          if (items.some((i) => i.clientId === item.clientId)) await deliver(item); // not settled meanwhile
        }
      })().finally(() => { flushing = null; });
    }
    return flushing;
  },
};

// The connection is back (or the device is online again): send what waited.
chatClient.onReconnected(() => { chatOutbox.flush(); });
if (typeof window !== 'undefined') window.addEventListener('online', () => { chatOutbox.flush(); });
