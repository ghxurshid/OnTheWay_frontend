import { useState, useEffect, useRef } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { CHAT_QUICK_KEYS, CHAT_REPLY_KEYS } from '@/constants/app';
import { authStore } from '@/services/authStore';
import { chatClient } from '@/services/realtime/chatClient';
import { chatApi } from '@/api/chatApi';

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isRealUser = (id) => GUID_RE.test(String(id || ''));
const toMsg = (m, myId) => ({
  id: m.id, from: m.senderId === myId ? 'me' : 'them', text: m.content, at: new Date(m.sentAtUtc),
});

/** 1:1 chat screen. Talks to the ChatHub for real users (REST back-fills
    history); falls back to a local auto-responder for simulated walkers. */
export function ChatScreen({ user, onBack }) {
  const isDriver = user.type === 'driver';
  const color = isDriver ? T.amber : T.purple;
  const live = isRealUser(user.id);
  const myId = authStore.getUser()?.id || null;

  const [msgs, setMsgs] = useState(live ? [] : [
    { id: 1, from: 'them',
      text: isDriver ? t('chat.greetDriverThem') : t('chat.greetPassengerThem'),
      at: new Date(Date.now() - 2 * 60000) },
    { id: 2, from: 'me', text: t('chat.greetMe'), at: new Date(Date.now() - 60000) },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef(null);
  const idRef = useRef(3);
  const typingTimerRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, typing]);

  // Live mode: back-fill history + subscribe to realtime delivery/typing.
  useEffect(() => {
    if (!live) return undefined;
    let alive = true;

    (async () => {
      try {
        const convos = await chatApi.conversations();
        const convo = convos.find((c) => c.otherParticipantId === user.id);
        if (!convo || !alive) return;
        const history = await chatApi.messages(convo.id);
        if (!alive) return;
        setMsgs(history.map((m) => toMsg(m, myId)).sort((a, b) => a.at - b.at));
      } catch { /* no history yet — start empty */ }
    })();

    const offMsg = chatClient.on('ReceiveMessage', (m) => {
      if (m.senderId !== user.id && m.senderId !== myId) return; // other conversation
      if (m.senderId === user.id) setTyping(false);
      setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, toMsg(m, myId)]));
    });
    const offTyping = chatClient.on('TypingIndicator', (fromUserId, isTyping) => {
      if (fromUserId === user.id) setTyping(isTyping);
    });

    return () => { alive = false; offMsg(); offTyping(); };
  }, [live, user.id, myId]);

  const send = (text) => {
    const txt = (text || '').trim();
    if (!txt) return;
    setInput('');

    if (live) {
      // The hub echoes the persisted message back to us, so we don't append
      // optimistically. Fall back to REST if the socket is down.
      chatClient.sendMessage(user.id, txt).catch(() => chatApi.send(user.id, txt).catch(() => {}));
      return;
    }

    // Demo fallback: local echo + simulated auto-reply.
    setMsgs((m) => [...m, { id: idRef.current++, from: 'me', text: txt, at: new Date() }]);
    setTimeout(() => setTyping(true), 600);
    setTimeout(() => {
      const reply = t(CHAT_REPLY_KEYS[Math.floor(Math.random() * CHAT_REPLY_KEYS.length)]);
      setTyping(false);
      setMsgs((m) => [...m, { id: idRef.current++, from: 'them', text: reply, at: new Date() }]);
    }, 1700 + Math.random() * 1400);
  };

  // Live typing indicator (debounced "stopped typing").
  const onInput = (val) => {
    setInput(val);
    if (!live) return;
    chatClient.sendTyping(user.id, true);
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => chatClient.sendTyping(user.id, false), 1500);
  };

  const fmtT = (d) => d.toLocaleTimeString('uz', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <div className="otw-screen" style={{ position: 'absolute', inset: 0, zIndex: 40,
      background: T.bg, display: 'flex', flexDirection: 'column',
      animation: 'slideUp .3s cubic-bezier(.34,1.2,.64,1)' }}>
      {/* Header */}
      <div style={{ padding: '42px 12px 10px', display: 'flex', alignItems: 'center', gap: 10,
        background: T.glassSolid, backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <button onClick={onBack} style={{ width: 36, height: 36, borderRadius: 10,
          background: 'transparent', border: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
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
            background: T.green, border: `2px solid ${T.bg}` }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
          <div style={{ fontSize: 11, color: T.green, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: T.green }} />
            {t('chat.online')} · {isDriver ? t('common.driver') : t('common.passenger')}
          </div>
        </div>
        <button title={t('chat.callTip')} style={{ width: 36, height: 36, borderRadius: 10,
          background: T.tealDim, border: `1px solid ${T.teal}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M3 4a1 1 0 0 1 1-1h2.5l1 2.5L6 6.5a8 8 0 0 0 3.5 3.5l1-1.5 2.5 1V12a1 1 0 0 1-1 1h-1A10 10 0 0 1 3 5V4Z"
              stroke={T.teal} strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 6px',
        display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ textAlign: 'center', fontSize: 10, color: T.muted, padding: '4px 0 8px' }}>
          {fmtT(new Date(Date.now() - 5 * 60000))} · {t('chat.connected')}
        </div>
        {msgs.map((m) => {
          const me = m.from === 'me';
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: me ? 'flex-end' : 'flex-start',
              animation: 'fadeUp .25s ease both' }}>
              <div style={{ maxWidth: '78%', padding: '8px 12px',
                borderRadius: me ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: me ? `linear-gradient(135deg,${T.teal},#0e9e97)` : T.surface2,
                color: me ? 'white' : T.text,
                border: me ? 'none' : `1px solid ${T.border}`,
                boxShadow: me ? `0 2px 10px ${T.tealGlow}` : 'none' }}>
                <div style={{ fontSize: 13, lineHeight: 1.4 }}>{m.text}</div>
                <div style={{ fontSize: 9, opacity: .6, marginTop: 3,
                  textAlign: 'right', color: me ? 'white' : T.muted }}>{fmtT(m.at)}</div>
              </div>
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
      <div style={{ padding: '8px 14px 28px', display: 'flex', gap: 8, alignItems: 'flex-end',
        borderTop: `1px solid ${T.border}`, background: T.glassSolid, flexShrink: 0 }}>
        <button title={t('chat.attachTip')} style={{ width: 40, height: 40, borderRadius: 12,
          border: `1px solid ${T.border}`, background: T.surface2, color: T.muted,
          cursor: 'pointer', fontSize: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>📎</button>
        <textarea value={input} onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder={t('chat.typeMessage')} rows={1}
          style={{ flex: 1, padding: '10px 14px', borderRadius: 18, resize: 'none',
            background: T.surface2, border: `1px solid ${T.border}`,
            color: T.text, fontSize: 13, outline: 'none', fontFamily: 'DM Sans,sans-serif',
            maxHeight: 80, minHeight: 40, lineHeight: 1.4 }} />
        <button onClick={() => send(input)} disabled={!input.trim()}
          style={{ width: 40, height: 40, borderRadius: 12, border: 'none',
            background: input.trim() ? `linear-gradient(135deg,${T.teal},#0e9e97)` : T.surface2,
            color: input.trim() ? 'white' : T.muted,
            cursor: input.trim() ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            boxShadow: input.trim() ? `0 3px 12px ${T.tealGlow}` : 'none',
            transition: 'all .15s ease', padding: 0 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 8l12-5-5 12-2-5-5-2Z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}
