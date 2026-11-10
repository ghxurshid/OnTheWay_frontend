import { T, TEAL_GRADIENT } from '@/constants/theme';
import { t } from '@/i18n';
import { closeApp, webApp } from '@/services/telegram';
import { errorMessage } from '@/utils/errors';

interface AuthErrorScreenProps {
  /** Boot failure to explain (localized via errorMessage). Ignored for "session". */
  error?: unknown;
  /** "boot": sign-in at startup failed. "session": a running session could not be renewed. */
  variant?: 'boot' | 'session';
  onRetry: () => void;
}

/** Sign-in failure (at boot, or a session that could not be renewed): what
    happened in plain words, a retry, and — inside Telegram — a way to reopen. */
export function AuthErrorScreen({ error, variant = 'boot', onRetry }: AuthErrorScreenProps) {
  const session = variant === 'session';
  const canClose = !!webApp()?.close;
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="auth-error-title"
      style={{ position: 'absolute', inset: 0, zIndex: 90, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, textAlign: 'center',
        background: T.bg }}>
      <div aria-hidden="true" style={{ fontSize: 34 }}>{session ? '🔒' : '⚠️'}</div>
      <div id="auth-error-title" style={{ fontSize: 16, fontWeight: 700, color: T.text }}>
        {session ? t('session.title') : t('auth.failedTitle')}
      </div>
      <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, maxWidth: 360 }}>
        {session ? t('session.body') : errorMessage(error)}
      </div>
      <button onClick={onRetry}
        style={{ marginTop: 8, padding: '11px 22px', borderRadius: 12, border: 'none',
          background: TEAL_GRADIENT, color: 'white', fontSize: 14,
          fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
        {session ? t('session.retry') : t('auth.retry')}
      </button>
      {canClose && (
        <button onClick={() => closeApp()} style={{ padding: '9px 18px', borderRadius: 12,
          border: `1px solid ${T.border}`, background: 'transparent', color: T.muted, fontSize: 13,
          cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{t('session.closeApp')}</button>
      )}
    </div>
  );
}
