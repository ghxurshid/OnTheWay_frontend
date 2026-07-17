/* ════════════════════════════════════════════════════════════════
   ErrorBoundary — stops a render/runtime throw in one subtree from
   blanking the whole SPA. Renders a themed fallback with a retry, and
   forwards the error to an optional onError sink (telemetry).

   Error boundaries must be class components (there is no hook equivalent
   for getDerivedStateFromError / componentDidCatch). Kept intentionally
   small and dependency-light so it can wrap the root and each screen.
   ════════════════════════════════════════════════════════════════ */

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  onReset?: () => void;
}
interface ErrorBoundaryState { error: Error | null }

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Dev visibility; wire onError to real telemetry in production.
    if (import.meta.env?.DEV) console.error('[ErrorBoundary]', error, info);
    this.props.onError?.(error, info);
  }

  handleReset() {
    // If a caller supplies onReset (e.g. reset app state) prefer it; the
    // default recovery is a soft in-place reset of the boundary subtree.
    if (this.props.onReset) { this.props.onReset(); this.setState({ error: null }); return; }
    this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.state.error, this.handleReset);

    return (
      <div role="alert" style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24,
        textAlign: 'center', background: T.bg, color: T.text, zIndex: 9999,
      }}>
        <div style={{ fontSize: 40, lineHeight: 1 }}>⚠️</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{t('errorBoundary.title')}</div>
        <div style={{ fontSize: 14, color: T.muted, maxWidth: 340 }}>{t('errorBoundary.message')}</div>
        <button onClick={this.handleReset} style={{
          marginTop: 6, padding: '10px 22px', borderRadius: 12, cursor: 'pointer',
          background: T.teal, color: '#04201e', border: 'none', fontSize: 14, fontWeight: 700,
        }}>
          {t('errorBoundary.retry')}
        </button>
      </div>
    );
  }
}
