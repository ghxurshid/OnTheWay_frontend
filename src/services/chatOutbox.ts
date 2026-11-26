/* ════════════════════════════════════════════════════════════════
   SERVICE — the chat outbox: every message I write, from the tap on "send"
   until the server has stored it. Persisted (localStorage), so a message
   written offline survives leaving the chat or closing the app.

   Each conversation's messages go out ONE AT A TIME, in the order written
   (a per-chat send queue, as messengers keep one): the next message is sent
   only once the one before it is stored, so the other person — and the
   history — read them in the order they were typed, whichever way each one
   went (the socket, or REST while the socket is down or asked to slow down).
   A message still waiting goes out as soon as sending works again: when a
   newer one is written, on a short backoff while anything waits, and on
   reconnect / back online. A queue left over from the last session drains in
   the same order once the app is up again (see useBootstrap).

   Each item carries a device-generated id (`clientId`) that goes with every
   attempt (socket, then REST): the server stores a message once per id, so a
   retry after a lost acknowledgement can never post it twice (Telegram's
   random_id, Matrix's transaction id). Outcomes are announced to the open
   chat through `on('settled' | 'failed')`; 'failed' carries the refusal
   (e.g. `user_blocked` — one of the two blocked the other), which is final:
   that message waits for the user's "resend" and never holds up the ones
   written after it. Being asked to slow down (the socket's `rate_limited`,
   then REST's 429) is no refusal: nothing is marked failed, the WHOLE queue
   pauses and picks up again a little later, in order (Telegram's FLOOD_WAIT,
   Matrix's M_LIMIT_EXCEEDED).
   ════════════════════════════════════════════════════════════════ */

import { chatApi } from '@/api/chatApi';
import type { ChatMessageDto } from '@/api/chatApi';
import { chatClient } from '@/services/realtime/chatClient';
import { createEmitter } from '@/services/realtime/hubConnection';
import { createBackoff, isRateLimited } from '@/services/realtime/retry';
import { isConflict, isNetworkError, isUserBlocked } from '@/utils/errors';
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

/** Every message not stored yet, all conversations, in the order written. */
let items: OutboxItem[] = readJson<OutboxItem[]>(KEY, []);
const events = createEmitter('chatOutbox');

/** How long sending pauses after the server asked to slow down, growing while it keeps
    asking (the socket's budget refills one message a second, REST's within a minute). */
const SLOW_DOWN_DELAYS_MS = [10_000, 20_000, 40_000, 60_000];

/** How long the socket may take to store a message before REST is tried (same id): a
    half-open socket would otherwise hold up every message behind it until it closes. */
export const SOCKET_ANSWER_MS = 10_000;

/** Sending is paused (asked to slow down): every conversation's messages wait, in order. */
let paused = false;
const resume = createBackoff(() => { paused = false; chatOutbox.flush(); }, SLOW_DOWN_DELAYS_MS);
/** A message could not get through (offline, server unreachable): try again soon. */
const retryLater = createBackoff(() => { chatOutbox.flush(); });

/** Conversations being sent right now (one loop each), and those told meanwhile that
    sending may work again (a newer message, a reconnect) — they look once more. */
const draining = new Map<string, Promise<void>>();
const nudged = new Set<string>();

const save = () => writeJson(KEY, items.length ? items : null);
const remove = (clientId: string) => { items = items.filter((i) => i.clientId !== clientId); save(); };
const markFailed = (clientId: string) => {
  items = items.map((i) => (i.clientId === clientId ? { ...i, failed: true } : i));
  save();
};
/** The oldest message to `toUserId` still to send (a refused one waits for "resend"). */
const headOf = (toUserId: string) => items.find((i) => i.toUserId === toUserId && !i.failed);

/** `promise`, or a rejection once it has taken longer than `ms`. */
function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Chat hub did not answer')), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** One send: the socket first, REST when the socket is down, slow or asked to slow down. */
async function sendOnce(item: OutboxItem): Promise<ChatMessageDto | null> {
  try {
    return await within(chatClient.sendMessage(item.toUserId, item.text, item.clientId), SOCKET_ANSWER_MS);
  } catch (e) {
    if (isUserBlocked(e)) throw e; // a refusal, not a transport problem: REST would say the same
    return chatApi.send(item.toUserId, item.text, item.clientId);
  }
}

/** What became of one delivery attempt: stored, refused for good, or still waiting
    (offline / asked to slow down — it stays first in its queue). */
type Outcome = 'settled' | 'failed' | 'waiting';

/** One delivery attempt. A 409 is retried once under the same id: it is a racing
    write (another attempt storing this very message — e.g. a slow socket answer and its
    REST fallback), and the retry gets the stored message back. A second 409 is a real
    refusal (e.g. a deactivated account) — the message was NOT stored, so it is shown as
    failed, never as sent. */
async function deliver(item: OutboxItem): Promise<Outcome> {
  try {
    let saved: ChatMessageDto | null;
    try {
      saved = await sendOnce(item);
    } catch (e) {
      if (!isConflict(e)) throw e;
      saved = await sendOnce(item);
    }
    remove(item.clientId);
    if (!paused) resume.reset(); // going through again: the next pause starts short
    if (!items.some((i) => !i.failed)) retryLater.reset(); // all through: the next outage starts short
    events.emit('settled', item, saved);
    return 'settled';
  } catch (e) {
    if (isRateLimited(e)) {
      paused = true; // it stays queued, and every message after it waits behind it
      resume.schedule();
      return 'waiting';
    }
    if (isNetworkError(e)) {
      retryLater.schedule(); // offline: it stays first in its queue and is tried again soon
      return 'waiting';
    }
    markFailed(item.clientId);
    events.emit('failed', item, e); // e.g. `user_blocked` → errorMessage(e) explains it
    return 'failed';
  }
}

/** Sends `toUserId`'s waiting messages one at a time, oldest first, until none is left
    or one cannot get through yet — then the rest keeps its order and waits. Called again
    while it runs (a newer message, a reconnect), it takes one more look before stopping. */
function drain(toUserId: string): Promise<void> {
  const running = draining.get(toUserId);
  if (running) { nudged.add(toUserId); return running; }
  let done!: () => void;
  const run = new Promise<void>((resolve) => { done = resolve; });
  draining.set(toUserId, run); // before the first look: a call from here on joins this loop
  (async () => {
    try {
      for (;;) {
        nudged.delete(toUserId);
        if (paused) return; // the pause's own flush picks it up
        const head = headOf(toUserId);
        if (!head) return;
        if ((await deliver(head)) === 'waiting' && !nudged.has(toUserId)) return;
      }
    } finally {
      // In the same step as the last look, so a message queued after it starts a new loop.
      draining.delete(toUserId);
      done();
    }
  })().catch((e) => console.error('[chatOutbox]', e));
  return run;
}

export const chatOutbox = {
  /** Subscribe to 'settled' (item, savedMessage | null) or 'failed' (item, error). */
  on: events.on,

  /** Messages to `userId` the server does not have yet, oldest first. */
  pendingFor: (userId: string): OutboxItem[] => items.filter((i) => i.toUserId === userId),

  /** Queue a message. It goes out once every older message to `toUserId` is through —
      at once when none waits (while sending is paused, it waits its turn). */
  send(toUserId: string, text: string): OutboxItem {
    const item: OutboxItem = { clientId: newClientId(), toUserId, text, at: Date.now() };
    items = [...items, item];
    save();
    drain(toUserId);
    return item;
  },

  /** "Resend" on a failed message: it takes its place in the queue again (where it was written). */
  retry(clientId: string): void {
    const item = items.find((i) => i.clientId === clientId);
    if (!item) return;
    items = items.map((i) => (i.clientId === clientId ? { ...i, failed: false } : i));
    save();
    drain(item.toUserId);
  },

  /** Send everything still waiting (not the refused ones), each conversation in order —
      unless sending is paused: then the pause's own flush sends it. */
  flush(): Promise<void> {
    if (paused) return Promise.resolve();
    const peers = new Set(items.filter((i) => !i.failed).map((i) => i.toUserId));
    return Promise.all([...peers].map(drain)).then(() => undefined);
  },
};

// The connection is back (or the device is online again): send what waited.
chatClient.onReconnected(() => { chatOutbox.flush(); });
if (typeof window !== 'undefined') window.addEventListener('online', () => { chatOutbox.flush(); });
