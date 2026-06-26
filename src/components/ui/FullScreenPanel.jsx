import { T } from '@/constants/theme';
import { t } from '@/i18n';

/** Full-screen slide-up panel shell with a back button + accent title. */
export function FullScreenPanel({ title, onClose, accent = T.teal, children }) {
  return (
    <div className="otw-screen" style={{ position: 'absolute', inset: 0, zIndex: 29, background: T.bg,
      display: 'flex', flexDirection: 'column', fontFamily: 'DM Sans,sans-serif',
      animation: 'slideUp .32s cubic-bezier(.34,1.1,.64,1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 16px 14px',
        borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <button onClick={onClose} aria-label={t('common.close')} style={{ width: 36, height: 36, borderRadius: 11,
          border: `1px solid ${T.border}`, background: T.hover, color: T.text,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1l12 12M13 1L1 13" stroke={T.text} strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 4, height: 18, borderRadius: 2, background: accent }} />
          <span style={{ fontSize: 17, fontWeight: 600, color: T.text }}>{title}</span>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}
