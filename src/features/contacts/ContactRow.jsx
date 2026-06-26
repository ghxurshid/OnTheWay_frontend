import { useState } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { useUnread } from '@/hooks/useUnread';

/** Single contact list row with presence dot, route badge and unread count. */
export function ContactRow({ c, onSelect }) {
  const [p, setP] = useState(false);
  const unread = useUnread()[c.id] || 0;
  const color = c.type === 'driver' ? T.amber : T.purple;
  return (
    <button onClick={() => onSelect(c)}
      onPointerDown={() => setP(true)} onPointerUp={() => setP(false)} onPointerLeave={() => setP(false)}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px',
        borderRadius: 14, border: `1px solid ${T.border}`, marginBottom: 8, cursor: 'pointer',
        background: p ? T.hover : T.surface2, transition: 'background .12s ease',
        fontFamily: 'DM Sans,sans-serif', textAlign: 'left' }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: `${color}20`,
          border: `1.5px solid ${color}45`, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 15, fontWeight: 700, color }}>{c.initials}</div>
        {unread > 0 && (
          <div style={{ position: 'absolute', top: -6, right: -6, minWidth: 19, height: 19, padding: '0 5px',
            borderRadius: 10, background: '#e8403a', color: '#fff', fontSize: 11, fontWeight: 700,
            lineHeight: '19px', textAlign: 'center', border: `2px solid ${T.surface2}`,
            boxShadow: '0 1px 5px rgba(0,0,0,.4)' }}>{unread > 9 ? '9+' : unread}</div>
        )}
        <div style={{ position: 'absolute', bottom: -1, right: -1, width: 13, height: 13, borderRadius: 7,
          background: c.online ? T.green : T.muted, border: `2.5px solid ${T.surface2}` }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.text, whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
          {c.hasRoute && (
            <span title={t('contacts.onRoadTip')} style={{ display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 9, fontWeight: 600, color: T.teal, background: T.tealDim,
              padding: '2px 6px', borderRadius: 6, flexShrink: 0 }}>
              <span style={{ width: 5, height: 5, borderRadius: 3, background: T.teal,
                animation: 'pulse 1.3s ease infinite' }} />{t('contacts.onRoad')}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: c.online ? T.green : T.muted, marginTop: 2 }}>
          {unread > 0
            ? <span style={{ color: '#e8403a', fontWeight: 600 }}>{t('push.newMessage')}{unread > 1 ? ` · ${unread}` : ''}</span>
            : <>{c.online ? t('common.online') : (c.lastSeen ? t('contacts.lastSeen', { time: c.lastSeen }) : t('common.offline'))}
              <span style={{ color: T.muted }}> · {c.type === 'driver' ? t('common.driver') : t('common.passenger')}</span></>}
        </div>
      </div>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
        <path d="M5 3 L9 7 L5 11" stroke={T.muted} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}
