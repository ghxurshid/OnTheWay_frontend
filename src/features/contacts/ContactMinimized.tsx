import { T } from '@/constants/theme';
import { t } from '@/i18n';
import type { Contact } from '@/models';

interface ContactMinimizedProps {
  contact: Contact;
  onBack: () => void;
  onCall: (c: Contact) => void;
  onSms: (c: Contact) => void;
}

/** Minimized contact sheet (shown when a contact is focused on the map). */
export function ContactMinimized({ contact: c, onBack, onCall, onSms }: ContactMinimizedProps) {
  const color = c.type === 'driver' ? T.amber : T.purple;
  return (
    <div className="otw-sheet" style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      background: T.glassSolid, backdropFilter: 'blur(28px)',
      borderRadius: '24px 24px 0 0', border: `1px solid ${T.border}`, borderBottom: 'none',
      boxShadow: '0 -10px 40px rgba(0,0,0,.5)', padding: '10px 16px calc(26px + env(safe-area-inset-bottom,0px))',
      animation: 'nb-panel-in 360ms cubic-bezier(.22,1,.36,1) forwards',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={onBack} style={{ height: 34, padding: '0 12px 0 8px', borderRadius: 10,
          background: T.hover, border: `1px solid ${T.border}`, color: T.text,
          fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
          fontFamily: 'DM Sans,sans-serif' }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7L9 12" stroke={T.text} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t('common.list')}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5,
          color: c.online ? T.green : T.muted, fontWeight: 600 }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: c.online ? T.green : T.muted }} />
          {c.online ? t('common.online') : (c.lastSeen || t('common.offline'))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{ width: 50, height: 50, borderRadius: 15, background: `${color}20`,
            border: `1.5px solid ${color}45`, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 18, fontWeight: 700, color }}>{c.initials}</div>
          <div style={{ position: 'absolute', bottom: -1, right: -1, width: 14, height: 14, borderRadius: 7,
            background: c.online ? T.green : T.muted, border: '2.5px solid #0f1117' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{c.name}</span>
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, background: `${color}20`,
              color, fontWeight: 600 }}>{c.type === 'driver' ? t('common.driver') : t('common.passenger')}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, fontSize: 11.5, color: T.muted, marginTop: 3 }}>
            <span>{c.phone}</span>
            <span style={{ color: T.amber }}>★ {c.rating}</span>
          </div>
        </div>
      </div>

      <div style={{ background: T.bg, borderRadius: 12, padding: '10px 12px', marginBottom: 12,
        border: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
            <path d="M7 1C4.5 1 2.5 3 2.5 5.5C2.5 9 7 13 7 13s4.5-4 4.5-7.5C11.5 3 9.5 1 7 1z"
              stroke={color} strokeWidth="1.3" />
            <circle cx="7" cy="5.5" r="1.6" fill={color} />
          </svg>
          <span style={{ fontSize: 12, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
            {c.latlng[0].toFixed(4)}, {c.latlng[1].toFixed(4)}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: T.teal }}>● {t('contacts.coordOnMap')}</span>
        </div>
        {c.hasRoute ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9, paddingTop: 9,
            borderTop: `1px solid ${T.border}`, fontSize: 11.5, color: T.teal }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: T.teal,
              animation: 'pulse 1.3s ease infinite' }} />
            {t('contacts.routeShown')}
          </div>
        ) : (
          <div style={{ marginTop: 9, paddingTop: 9, borderTop: `1px solid ${T.border}`,
            fontSize: 11.5, color: T.muted }}>
            {t('contacts.noRoute')}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => onCall(c)} style={{ flex: 1, padding: '12px', borderRadius: 13, border: 'none',
          background: `linear-gradient(135deg,${T.teal},#0e9e97)`, color: 'white', fontSize: 14,
          fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
          boxShadow: `0 4px 16px ${T.tealGlow}`, display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 7 }}>📞 {t('common.call')}</button>
        <button onClick={() => onSms(c)} style={{ flex: 1, padding: '12px', borderRadius: 13,
          border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 14,
          fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>💬 SMS</button>
      </div>
    </div>
  );
}
