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
  initDataUnsafe?: { user?: unknown };
  ready?: () => void;
  expand?: () => void;
  close?: () => void;
  BackButton?: TelegramBackButton;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  HapticFeedback?: { notificationOccurred?: (type: 'error' | 'success' | 'warning') => void };
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

/** Close the Mini App (Telegram only). Returns false outside Telegram. */
export function closeApp(): boolean {
  const close = webApp()?.close;
  if (!close) return false;
  safe(close);
  return true;
}
