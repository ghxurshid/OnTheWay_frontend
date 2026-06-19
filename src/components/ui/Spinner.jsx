import { T } from '@/constants/theme';
import { t } from '@/i18n';

/** Centred loading spinner with an optional label. */
export function Spinner({ label, padding = '40px 0' }) {
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
