import type { ReactNode } from 'react';
import { T, TEAL_GRADIENT } from '@/constants/theme';
import { t } from '@/i18n';

interface PrimaryButtonProps {
  enabled: boolean;
  onClick: () => void;
  children: ReactNode;
  /** A request is in flight: shows progress and ignores further taps (no duplicates). */
  busy?: boolean;
}

/** Full-width gradient CTA with disabled and busy states. */
export function PrimaryButton({ enabled, onClick, children, busy = false }: PrimaryButtonProps) {
  const active = enabled && !busy;
  return (
    <button onClick={() => active && onClick()} disabled={!active} aria-busy={busy}
      style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none',
        background: active ? TEAL_GRADIENT : T.surface2,
        color: active ? 'white' : T.muted, fontSize: 15, fontWeight: 600,
        cursor: busy ? 'progress' : active ? 'pointer' : 'not-allowed',
        boxShadow: active ? `0 4px 20px ${T.tealGlow}` : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        fontFamily: 'DM Sans,sans-serif', transition: 'all .2s ease' }}>
      {busy && <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 7,
        border: `2px solid ${T.muted}55`, borderTop: `2px solid ${T.text}`, animation: 'spin .7s linear infinite' }} />}
      {busy ? t('common.sending') : children}
    </button>
  );
}
