import type { ReactNode } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';

/** Car / person glyphs shared by the map chrome, lists and cards. */
export function RoleGlyph({ type, size = 18, color = 'currentColor' }: { type: 'driver' | 'passenger' | string; size?: number; color?: string }) {
  if (type === 'driver') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6.2 10.5 7.6 6.9A2 2 0 0 1 9.5 5.6h5a2 2 0 0 1 1.9 1.3l1.4 3.6" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        <rect x="3.5" y="10.2" width="17" height="6.3" rx="2.2" fill={color} />
        <circle cx="7.6" cy="17" r="2" fill={color} /><circle cx="16.4" cy="17" r="2" fill={color} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="7.2" r="3.7" fill={color} />
      <path d="M4.8 20.6c0-4.1 3.2-7 7.2-7s7.2 2.9 7.2 7z" fill={color} />
    </svg>
  );
}

/** A bottom sheet shell over the map: grabber, title row, scrollable body. */
export function MapSheet({ title, sub, onClose, children, zIndex = 26, maxHeight = '72%' }: {
  title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; zIndex?: number; maxHeight?: string;
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,.35)' }} />
      <div role="dialog" aria-label={typeof title === 'string' ? title : undefined} style={{ background: T.surface,
        borderRadius: '24px 24px 0 0', maxHeight, display: 'flex', flexDirection: 'column',
        animation: 'slideUp .3s cubic-bezier(.34,1.2,.64,1)', paddingBottom: 'env(safe-area-inset-bottom,0px)',
        borderTop: `1px solid ${T.border}` }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border, margin: '10px auto 0', flexShrink: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px 12px', flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>{title}</div>
            {sub && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>{sub}</div>}
          </div>
          <button onClick={onClose} aria-label={t('common.close')} style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            border: `1px solid ${T.border}`, background: T.hover, color: T.muted, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke={T.muted} strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 16px 18px' }}>{children}</div>
      </div>
    </div>
  );
}
