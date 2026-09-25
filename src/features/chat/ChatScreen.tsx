import { useState, useEffect, useRef, useCallback } from 'react';
import { T, TEAL_GRADIENT, RECEIPT_READ, partyColor } from '@/constants/theme';
import { t } from '@/i18n';
import { CHAT_QUICK_KEYS, randomChatReplyKey } from '@/constants/app';
import { authStore } from '@/services/authStore';
import { chatClient } from '@/services/realtime/chatClient';
import { presenceClient } from '@/services/realtime/presenceClient';
import { unreadStore } from '@/services/unreadStore';
import { isAppInForeground, onAppForeground } from '@/services/telegram';
import { NO_WATERMARKS, displayStatus, furtherStatus, raiseWatermark, statusFromServer } from '@/services/messageStatus';
import type { MessageStatus, Watermarks } from '@/services/messageStatus';
import { chatApi } from '@/api/chatApi';
import type { ChatMessageDto, MessageReceipt } from '@/api/chatApi';
import { useBackHandler } from '@/hooks/useBackHandler';
import { ErrorState } from '@/components/ui/StatusStates';
import { MessageTicks } from '@/components/ui/MessageTicks';
import { fmt12 } from '@/utils/datetime';
import { idOf, isRealUserId } from '@/utils/ids';
import type { PartyType } from '@/models';

interface ChatUser { id: string | number; type: PartyType; name: string; initials: string }

/** pending → confirmed by the socket echo / REST (sent) → receipts lift it to
    delivered / read; failed → tap to resend. */
interface Msg { id: string; from: 'me' | 'them'; text: string; at: Date; status: MessageStatus }

interface ChatScreenProps {
  user: ChatUser;
  onBack: () => void;
  /** Start a voice call with this user (hidden when absent). */
  onCall?: (user: ChatUser) => void;
}

const MAX_LENGTH = 4000;
const PAGE_SIZE = 30;

// Ids arrive as numbers over REST and as strings over the hub, so they are
// always compared as strings (idOf) to avoid number-vs-string mismatches.
const toMsg = (m: ChatMessageDto, myId: string | null): Msg => {
  const mine = idOf(m.senderId) === myId;
  return { id: idOf(m.id), from: mine ? 'me' : 'them', text: m.content, at: new Date(m.sentAtUtc),
    status: mine ? statusFromServer(m) : 'sent' };
};
const byTime = (a: Msg, b: Msg) => a.at.getTime() - b.at.getTime();
const inFlight = (m: Msg) => m.status === 'pending' || m.status === 'failed';

/** 1:1 chat screen. Real users: ChatHub delivery + REST history (paged), a
    REST fallback when the socket is down, and messenger-style receipts — each
    of my messages shows 🕓 / ✓ / ✓✓ delivered / ✓✓ read. Simulated walkers get
    a local auto-responder. */
export function ChatScreen({ user, onBack, onCall }: ChatScreenProps) {
  const isDriver = user.type === 'driver';
  const color = partyColor(user.type);
  const live = isRealUserId(user.id);
  const uid = idOf(user.id);
  const authedId = (authStore.getUser() as { id?: string | number } | null)?.id;
  const myId = authedId != null ? idOf(authedId) : null;
  useBackHandler(onBack);

  const [msgs, setMsgs] = useState<Msg[]>(live ? [] : [
    { id: 'd1', from: 'them', status: 'sent',
      text: isDriver ? t('chat.greetDriverThem') : t('chat.greetPassengerThem'),
      at: new Date(Date.now() - 2 * 60000) },
    { id: 'd2', from: 'me', status: 'read', text: t('chat.greetMe'), at: new Date(Date.now() - 60000) },
  ]);
  // How far the other side has received / read my messages (their receipts).
  const [outbox, setOutbox] = useState<Watermarks>(NO_WATERMARKS);
  const [page, setPage] = useState(1);
  const [hasOlder, setHasOlder] = useState(false);
  const [loading, setLoading] = useState(live);
  const [historyError, setHistoryError] = useState<unknown>(null);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [online, setOnline] = useState(() => !live || presenceClient.isOnline(uid));
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const seqRef = useRef(0);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [msgs, typing]);

  // Merge server messages into the list: dedupe by id (keeping the further
  // receipt state — a resync carries what the socket missed) and settle the
  // matching in-flight bubble (same text from me) instead of showing it twice.
  const merge = useCallback((incoming: Msg[]) => {
    setMsgs((cur) => {
      let next = cur;
      for (const m of incoming) {
        const known = next.findIndex((x) => x.id === m.id);
        if (known >= 0) {
          const status = furtherStatus(next[known].status, m.status);
          if (status !== next[known].status) next = next.map((x, i) => (i === known ? { ...x, status } : x));
          continue;
        }
        const pending = m.from === 'me' ? next.findIndex((x) => inFlight(x) && x.from === 'me' && x.text === m.text) : -1;
        next = pending >= 0 ? next.map((x, i) => (i === pending ? m : x)) : [...next, m];
      }
      return [...next].sort(byTime);
    });
  }, []);

  const loadPage = useCallback(async (pageNumber: number) => {
    setLoading(true);
    setHistoryError(null);
    try {
      const { items, hasNextPage } = await chatApi.withUser(uid, pageNumber, PAGE_SIZE);
      if (pageNumber > 1) stickToBottom.current = false;
      merge(items.map((m) => toMsg(m, myId)));
      setHasOlder(hasNextPage);
      setPage(pageNumber);
    } catch (e) {
      setHistoryError(e);
    } finally {
      setLoading(false);
    }
  }, [uid, myId, merge]);

  // Quiet refresh of the newest page after a reconnect: messages and receipts
  // the socket missed (the history carries each message's receipt times).
  const resync = useCallback(() => {
    chatApi.withUser(uid, 1, PAGE_SIZE)
      .then(({ items }) => merge(items.map((m) => toMsg(m, myId))))
      .catch(() => { /* the next reconnect retries */ });
  }, [uid, myId, merge]);

  // Live mode: history, realtime delivery/typing/receipts, presence.
  useEffect(() => {
    if (!live) return undefined;
    loadPage(1);

    // A read receipt means the user saw it, so only while the app is in view
    // (not minimized / in a background tab): on open, on arrival, on return.
    const markSeen = (upToMessageId?: string) => {
      if (!isAppInForeground()) return;
      unreadStore.clear(uid);
      chatApi.markRead(uid, upToMessageId).catch(() => {});
    };
    markSeen();

    const offMsg = chatClient.on('ReceiveMessage', (m: ChatMessageDto) => {
      const from = idOf(m.senderId);
      if (from !== uid && from !== myId) return; // other conversation
      if (from === uid) {
        setTyping(false);
        markSeen(idOf(m.id));
      }
      stickToBottom.current = true;
      merge([toMsg(m, myId)]);
    });
    const onReceipt = (kind: keyof Watermarks) => (r: MessageReceipt) => {
      if (idOf(r.byUserId) === uid) setOutbox((w) => raiseWatermark(w, kind, idOf(r.upToMessageId)));
    };
    const offDelivered = chatClient.on('MessagesDelivered', onReceipt('delivered'));
    const offRead = chatClient.on('MessagesRead', onReceipt('read'));
    const offTyping = chatClient.on('TypingIndicator', (fromUserId, isTyping) => {
      if (idOf(fromUserId) === uid) setTyping(isTyping);
    });
    const offReconnected = chatClient.onReconnected(() => { resync(); markSeen(); });
    const offForeground = onAppForeground(() => markSeen());
    const offOnline = presenceClient.on('UserOnline', (id) => { if (idOf(id) === uid) setOnline(true); });
    const offOffline = presenceClient.on('UserOffline', (id) => { if (idOf(id) === uid) setOnline(false); });

    return () => {
      offMsg(); offDelivered(); offRead(); offTyping(); offReconnected(); offForeground(); offOnline(); offOffline();
    };
  }, [live, uid, myId, loadPage, merge, resync]);

  const setStatus = (id: string, status: MessageStatus) =>
    setMsgs((cur) => cur.map((m) => (m.id === id ? { ...m, status } : m)));

  // Deliver one message: the socket first (its echo confirms it), REST if the
  // socket is down (the response confirms it), "failed" if both fail.
  const deliver = async (localId: string, text: string) => {
    setStatus(localId, 'pending');
    try {
      await chatClient.sendMessage(uid, text);
    } catch {
      try {
        const saved = await chatApi.send(uid, text);
        if (saved) merge([toMsg(saved, myId)]);
        else setStatus(localId, 'sent');
      } catch {
        setStatus(localId, 'failed');
      }
    }
  };

  const send = (text: string) => {
    const txt = (text || '').trim().slice(0, MAX_LENGTH);
    if (!txt) return;
    setInput('');
    stickToBottom.current = true;
    const localId = `local-${++seqRef.current}`;
    setMsgs((m) => [...m, { id: localId, from: 'me', text: txt, at: new Date(), status: live ? 'pending' : 'sent' }]);

    if (live) { deliver(localId, txt); return; }

    // Demo fallback: the simulated walker receives and reads it, then replies.
    setTimeout(() => setStatus(localId, 'delivered'), 350);
    setTimeout(() => { setStatus(localId, 'read'); setTyping(true); }, 600);
    setTimeout(() => {
      setTyping(false);
      setMsgs((m) => [...m, { id: `demo-${++seqRef.current}`, from: 'them', status: 'sent', text: t(randomChatReplyKey()), at: new Date() }]);
    }, 1700 + Math.random() * 1400);
  };

  // Live typing indicator (debounced "stopped typing").
  const onInput = (val: string) => {
    setInput(val);
    if (!live) return;
    chatClient.sendTyping(uid, true);
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => chatClient.sendTyping(uid, false), 1500);
  };

  return (
    <div className="otw-screen" role="dialog" aria-modal="true" aria-label={user.name} style={{ position: 'absolute', inset: 0, zIndex: 40,
      background: T.bg, display: 'flex', flexDirection: 'column',
      animation: 'slideUp .3s cubic-bezier(.34,1.2,.64,1)' }}>
      {/* Header */}
      <div style={{ padding: '14px 12px 10px', display: 'flex', alignItems: 'center', gap: 10,
        background: T.glassSolid, backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <button onClick={onBack} aria-label={t('common.back')} style={{ width: 36, height: 36, borderRadius: 10,
          background: 'transparent', border: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M9 3 L4 7 L9 11" stroke={T.text} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: `${color}22`,
            border: `1.5px solid ${color}50`,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color }}>{user.initials}</span>
          </div>
          <div style={{ position: 'absolute', bottom: -2, right: -2, width: 11, height: 11, borderRadius: 6,
            background: online ? T.green : T.muted, border: `2px solid ${T.bg}` }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
          <div style={{ fontSize: 11, color: online ? T.green : T.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: online ? T.green : T.muted }} />
            {online ? t('chat.online') : t('chat.offline')} · {isDriver ? t('common.driver') : t('common.passenger')}
          </div>
        </div>
        {onCall && (
          <button onClick={() => onCall(user)} aria-label={t('chat.callTip')} title={t('chat.callTip')} style={{ width: 36, height: 36, borderRadius: 10,
            background: T.tealDim, border: `1px solid ${T.teal}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 4a1 1 0 0 1 1-1h2.5l1 2.5L6 6.5a8 8 0 0 0 3.5 3.5l1-1.5 2.5 1V12a1 1 0 0 1-1 1h-1A10 10 0 0 1 3 5V4Z"
                stroke={T.teal} strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} aria-live="polite" onScroll={(e) => {
        const el = e.currentTarget;
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }} style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 6px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {hasOlder && !loading && (
          <button onClick={() => loadPage(page + 1)} style={{ alignSelf: 'center', padding: '6px 14px', borderRadius: 14,
            border: `1px solid ${T.border}`, background: T.surface2, color: T.muted, fontSize: 12, cursor: 'pointer',
            fontFamily: 'DM Sans,sans-serif', marginBottom: 6 }}>{t('chat.loadOlder')}</button>
        )}
        {loading && (
          <div aria-hidden="true" style={{ alignSelf: 'center', width: 18, height: 18, borderRadius: 9, margin: '8px 0',
            border: `2px solid ${T.tealDim}`, borderTop: `2px solid ${T.teal}`, animation: 'spin .7s linear infinite' }} />
        )}
        {historyError != null && <ErrorState compact error={historyError} fallbackKey="chat.historyFailed" onRetry={() => loadPage(page)} />}
        {live && !loading && historyError == null && msgs.length === 0 && (
          <div style={{ textAlign: 'center', fontSize: 12.5, color: T.muted, padding: '24px 12px' }}>{t('chat.empty')}</div>
        )}
        {msgs.map((m) => {
          const me = m.from === 'me';
          const status = me ? displayStatus(m.id, m.status, outbox) : m.status;
          const failed = status === 'failed';
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: me ? 'flex-end' : 'flex-start',
              animation: 'fadeUp .25s ease both' }}>
              <div style={{ maxWidth: '78%', padding: '8px 12px',
                borderRadius: me ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: me ? (failed ? T.surface2 : TEAL_GRADIENT) : T.surface2,
                color: me && !failed ? 'white' : T.text,
                border: me && !failed ? 'none' : `1px solid ${failed ? T.red + '66' : T.border}`,
                opacity: status === 'pending' ? 0.7 : 1,
                boxShadow: me && !failed ? `0 2px 10px ${T.tealGlow}` : 'none' }}>
                <div style={{ fontSize: 13, lineHeight: 1.4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.text}</div>
                <div style={{ fontSize: 9, marginTop: 3, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                  gap: 3, color: me && !failed ? 'rgba(255,255,255,0.75)' : T.muted }}>
                  {failed ? t('chat.failed') : fmt12(m.at)}
                  {me && !failed && <MessageTicks status={status} color="rgba(255,255,255,0.75)" readColor={RECEIPT_READ} />}
                </div>
              </div>
              {failed && (
                <button onClick={() => deliver(m.id, m.text)} style={{ marginTop: 3, border: 'none', background: 'transparent',
                  color: T.red, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
                  ↻ {t('chat.resend')}
                </button>
              )}
            </div>
          );
        })}
        {typing && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', animation: 'fadeUp .2s ease both' }}>
            <div style={{ padding: '10px 14px', borderRadius: '16px 16px 16px 4px',
              background: T.surface2, border: `1px solid ${T.border}`,
              display: 'flex', gap: 4, alignItems: 'center' }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: 3, background: T.muted,
                  animation: `dotBounce .9s ${i * .15}s ease-in-out infinite` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quick replies */}
      <div style={{ padding: '4px 14px 6px', display: 'flex', gap: 6, overflowX: 'auto',
        flexShrink: 0, scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
        WebkitMaskImage: 'linear-gradient(to right,transparent 0,#000 14px,#000 calc(100% - 14px),transparent 100%)',
        maskImage: 'linear-gradient(to right,transparent 0,#000 14px,#000 calc(100% - 14px),transparent 100%)' }}>
        {CHAT_QUICK_KEYS.map((k, i) => (
          <button key={i} onClick={() => send(t(k))}
            style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 16,
              border: `1px solid ${T.border}`, background: T.surface2,
              color: T.text, fontSize: 11, cursor: 'pointer',
              whiteSpace: 'nowrap', fontFamily: 'DM Sans,sans-serif' }}>
            {t(k)}
          </button>
        ))}
      </div>

      {/* Input */}
      <div style={{ padding: '8px 14px 12px', display: 'flex', gap: 8, alignItems: 'flex-end',
        borderTop: `1px solid ${T.border}`, background: T.glassSolid, flexShrink: 0 }}>
        <textarea value={input} onChange={(e) => onInput(e.target.value)} maxLength={MAX_LENGTH}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder={t('chat.typeMessage')} aria-label={t('chat.typeMessage')} rows={1}
          style={{ flex: 1, padding: '10px 14px', borderRadius: 18, resize: 'none',
            background: T.surface2, border: `1px solid ${T.border}`,
            color: T.text, fontSize: 13, fontFamily: 'DM Sans,sans-serif',
            maxHeight: 80, minHeight: 40, lineHeight: 1.4 }} />
        <button onClick={() => send(input)} disabled={!input.trim()} aria-label={t('chat.send')}
          style={{ width: 40, height: 40, borderRadius: 12, border: 'none',
            background: input.trim() ? TEAL_GRADIENT : T.surface2,
            color: input.trim() ? 'white' : T.muted,
            cursor: input.trim() ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            boxShadow: input.trim() ? `0 3px 12px ${T.tealGlow}` : 'none',
            transition: 'all .15s ease', padding: 0 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M2 8l12-5-5 12-2-5-5-2Z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}
