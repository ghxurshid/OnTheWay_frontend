import type { CSSProperties } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';

interface SpinnerProps { label?: string | null; padding?: string }

/** Centred loading spinner with an optional label. */
export function Spinner({ label, padding = '40px 0' }: SpinnerProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 14, padding }}>
      <div style={{ width: 40, height: 40, borderRadius: 20,
        border: `3px solid ${T.tealDim}`, borderTop: `3px solid ${T.teal}`,
        animation: 'spin .8s linear infinite' }} />
      {label !== null && <div style={{ fontSize: 13, color: T.muted }}>{label || t('form.searching')}</div>}
    </div>
  );
}

interface InlineSpinnerProps { size?: number; style?: CSSProperties }

/** Small spinner + "searching…" caption for inline lookups (address search). */
export function InlineSpinner({ size = 16, style }: InlineSpinnerProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...style }}>
      <div style={{ width: size, height: size, borderRadius: size / 2, border: `2px solid ${T.tealDim}`,
        borderTop: `2px solid ${T.teal}`, animation: 'spin .7s linear infinite' }} />
      <span style={{ fontSize: 12, color: T.muted }}>{t('form.searching')}</span>
    </div>
  );
}
