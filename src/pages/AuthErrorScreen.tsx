import { T, TEAL_GRADIENT } from '@/constants/theme';
import { t } from '@/i18n';

/** Boot failure (sign-in / network): shows the reason and a retry button. */
export function AuthErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, textAlign: 'center',
      background: T.bg }}>
      <div style={{ fontSize: 34 }}>⚠️</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{t('auth.failedTitle')}</div>
      <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, maxWidth: 360 }}>{error}</div>
      <button onClick={onRetry}
        style={{ marginTop: 8, padding: '11px 22px', borderRadius: 12, border: 'none',
          background: TEAL_GRADIENT, color: 'white', fontSize: 14,
          fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
        {t('auth.retry')}
      </button>
    </div>
  );
}
