/* ════════════════════════════════════════════════════════════════
   TELEGRAM MINI APP bridge.
   ────────────────────────────────────────────────────────────────
   Thin accessor over `window.Telegram.WebApp`. The backend needs the raw
   signed `initData` (HMAC-verified on /auth/telegram); the UI uses the
   native Back button, closing confirmation and haptics. Outside Telegram
   (plain browser during development) the SDK is absent: initData falls back
   to VITE_TG_INIT_DATA and every UI helper is a safe no-op.
   ════════════════════════════════════════════════════════════════ */

const env = import.meta.env || {};

interface TelegramBackButton {
  show?: () => void;
  hide?: () => void;
  onClick?: (fn: () => void) => void;
}

interface TelegramWebApp {
  initData?: string;
  initDataUnsafe?: { user?: unknown; start_param?: string };
  ready?: () => void;
  expand?: () => void;
  close?: () => void;
  BackButton?: TelegramBackButton;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  HapticFeedback?: { notificationOccurred?: (type: 'error' | 'success' | 'warning') => void };
  /** Bot API 8.0+: false while the Mini App is minimized. */
  isActive?: boolean;
  onEvent?: (event: string, handler: () => void) => void;
  offEvent?: (event: string, handler: () => void) => void;
}

function tg(): { WebApp?: TelegramWebApp } | undefined {
  return (typeof window !== 'undefined' ? (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram : undefined);
}

/** The Telegram.WebApp object, or null when not running inside Telegram. */
export function webApp(): TelegramWebApp | null {
  return tg()?.WebApp || null;
}

/**
 * Raw signed initData to forward to the backend. Prefers the real Telegram
 * value; falls back to the dev override so the app is testable in a browser.
 */
export function getInitData(): string {
  return webApp()?.initData || env.VITE_TG_INIT_DATA || '';
}

const safe = (fn: () => void) => { try { fn(); } catch { /* older clients lack some methods */ } };

/** Signal Telegram we're ready and expand to full height. Safe to call always. */
export function initTelegramUi(): void {
  const wa = webApp();
  safe(() => { wa?.ready?.(); wa?.expand?.(); });
}

/** Ask before Telegram closes the app (on while a trip or a draft is active). */
export function setClosingConfirmation(enabled: boolean): void {
  const wa = webApp();
  safe(() => (enabled ? wa?.enableClosingConfirmation?.() : wa?.disableClosingConfirmation?.()));
}

/** A short vibration pattern for important events (incoming call, error). */
export function haptic(type: 'error' | 'success' | 'warning'): void {
  safe(() => webApp()?.HapticFeedback?.notificationOccurred?.(type));
}

/** URL parameters that carry a start parameter (see getStartParam). */
export const START_PARAM_KEYS = ['tgWebAppStartParam', 'startapp'] as const;

/**
 * The launch's start parameter, if any. Telegram passes it for direct t.me links
 * (initDataUnsafe.start_param, or tgWebAppStartParam in the URL); keyboard/inline
 * web_app buttons get none, so the bot adds `?startapp=…` to the Mini App URL.
 */
export function getStartParam(): string | null {
  const fromTelegram = webApp()?.initDataUnsafe?.start_param;
  if (fromTelegram) return fromTelegram;
  if (typeof window === 'undefined') return null;
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  for (const key of START_PARAM_KEYS) {
    const value = query.get(key) || hash.get(key);
    if (value) return value;
  }
  return null;
}

/** True while the user can actually see the app: the page is visible and the
    Mini App is not minimized (clients before Bot API 8.0 lack `isActive`). */
export function isAppInForeground(): boolean {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
  return webApp()?.isActive !== false;
}

/** Calls `fn` each time the app comes back into view (tab shown, Mini App
    restored). Returns an unsubscribe. */
export function onAppForeground(fn: () => void): () => void {
  const handler = () => { if (isAppInForeground()) fn(); };
  const wa = webApp();
  document.addEventListener('visibilitychange', handler);
  safe(() => wa?.onEvent?.('activated', handler));
  return () => {
    document.removeEventListener('visibilitychange', handler);
    safe(() => wa?.offEvent?.('activated', handler));
  };
}

/** Close the Mini App (Telegram only). Returns false outside Telegram. */
export function closeApp(): boolean {
  const close = webApp()?.close;
  if (!close) return false;
  safe(close);
  return true;
}
