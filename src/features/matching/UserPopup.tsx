import { T } from '@/constants/theme';
import { t } from '@/i18n';

interface PopupUser {
  type: 'driver' | 'passenger';
  initials: string;
  name: string;
  sub?: string;
  rating?: number | string;
  trips?: number;
  dist?: string;
  eta?: string;
}
interface UserPopupProps {
  user: PopupUser;
  onClose: () => void;
  onCall: () => void;
  onChat: () => void;
}

/** Bottom-sheet profile popup for a selected matched user (call / chat). */
export function UserPopup({ user, onClose, onCall, onChat }: UserPopupProps) {
  const isDriver = user.type === 'driver';
  const color = isDriver ? T.amber : T.purple;
  const stats: [string, string | undefined, string][] = [
    [t('userPopup.distance'), user.dist, color],
    [t('userPopup.arrival'), user.eta, color],
    [t('userPopup.match'), '87%', T.green],
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 25, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', pointerEvents: 'none' }}>
      <div style={{ flex: 1, pointerEvents: 'none' }} />
      <div style={{ background: T.surface, borderRadius: '24px 24px 0 0', pointerEvents: 'auto',
        animation: 'slideUp .3s cubic-bezier(.34,1.2,.64,1)', padding: '20px 20px 44px' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border, margin: '0 auto 20px' }} />
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <div style={{ position: 'relative' }}>
            <div style={{ width: 60, height: 60, borderRadius: 18, background: `${color}22`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `2px solid ${color}50` }}>
              <span style={{ fontSize: 20, fontWeight: 700, color }}>{user.initials}</span>
            </div>
            <div style={{ position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: 6,
              background: T.green, border: `2px solid ${T.surface}` }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{user.name}</div>
              <div style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: `${color}20`,
                color, fontWeight: 600 }}>{isDriver ? t('common.driver') : t('common.passenger')}</div>
            </div>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>{user.sub}</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
              <span style={{ fontSize: 12, color: T.muted }}>⭐ {user.rating}</span>
              <span style={{ fontSize: 12, color: T.muted }}>🛣️ {t('userPopup.tripsCount', { n: user.trips })}</span>
            </div>
          </div>
        </div>
        <div style={{ background: T.bg, borderRadius: 14, padding: '12px 14px', marginBottom: 16,
          border: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between' }}>
          {stats.map(([l, v, c]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: c }}>{v}</div>
              <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCall} style={{ flex: 1, padding: '14px', borderRadius: 14, border: 'none',
            background: `linear-gradient(135deg,${T.teal},#0e9e97)`,
            color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: `0 4px 20px ${T.tealGlow}`, fontFamily: 'DM Sans,sans-serif',
            animation: 'callPulse 2s ease infinite' }}>
            📞 {t('common.call')}
          </button>
          <button onClick={onChat} style={{ padding: '0 18px', borderRadius: 14,
            border: `1px solid ${color}50`, background: `${color}18`,
            color, fontSize: 15, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontFamily: 'DM Sans,sans-serif' }}>
            💬 {t('common.chat')}
          </button>
          <button onClick={onClose} style={{ width: 48, height: 48, borderRadius: 14,
            border: `1px solid ${T.border}`, background: 'transparent',
            color: T.muted, cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
      </div>
    </div>
  );
}
