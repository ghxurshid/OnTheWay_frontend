import type { ReactNode } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { errorMessage } from '@/utils/errors';

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  /** i18n key used when the error has no more specific message. */
  fallbackKey?: string;
  compact?: boolean;
}

/** "Could not load" block: what happened (localized) + a retry action. */
export function ErrorState({ error, onRetry, fallbackKey = 'errors.loadFailed', compact }: ErrorStateProps) {
  return (
    <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      textAlign: 'center', padding: compact ? '16px 12px' : '36px 24px' }}>
      <div aria-hidden="true" style={{ fontSize: compact ? 22 : 30 }}>⚠️</div>
      <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.5, maxWidth: 300 }}>{errorMessage(error, fallbackKey)}</div>
      {onRetry && (
        <button onClick={onRetry} style={{ padding: '9px 18px', borderRadius: 11, border: `1px solid ${T.teal}55`,
          background: T.tealDim, color: T.teal, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'DM Sans,sans-serif' }}>{t('common.retry')}</button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
}

/** Explains why a list is empty and what to do next. */
export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      textAlign: 'center', padding: '32px 24px' }}>
      <div aria-hidden="true" style={{ fontSize: 30 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{title}</div>
      {body && <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.55, maxWidth: 280 }}>{body}</div>}
      {action && (
        <button onClick={action.onClick} style={{ marginTop: 6, padding: '9px 18px', borderRadius: 11,
          border: `1px solid ${T.teal}55`, background: T.tealDim, color: T.teal, fontSize: 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{action.label}</button>
      )}
    </div>
  );
}
