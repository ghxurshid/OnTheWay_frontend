/* ════════════════════════════════════════════════════════════════
   TELEGRAM MINI APP bridge.
   ────────────────────────────────────────────────────────────────
   Thin accessor over `window.Telegram.WebApp`. The backend needs the raw
   signed `initData` (HMAC-verified on /auth/telegram); the UI uses the
   native Back button, closing confirmation and haptics. The SDK script loads
   in a plain browser too (development, QA): `Telegram.WebApp` then exists but
   has no initData and its native buttons are invisible. initData falls back
   to VITE_TG_INIT_DATA, the helpers are safe no-ops, and `mainButton()` is
   null there so screens render their own in-page buttons.
   ════════════════════════════════════════════════════════════════ */

const env = import.meta.env || {};

interface TelegramBackButton {
  show?: () => void;
  hide?: () => void;
  onClick?: (fn: () => void) => void;
}

interface TelegramMainButton {
  setText?: (text: string) => void;
  show?: () => void;
  hide?: () => void;
  enable?: () => void;
  disable?: () => void;
  showProgress?: (leaveActive?: boolean) => void;
  hideProgress?: () => void;
  onClick?: (fn: () => void) => void;
  offClick?: (fn: () => void) => void;
  setParams?: (p: Record<string, unknown>) => void;
}

/** The Telegram user the Mini App was opened by (only the fields we show). */
export interface TelegramUser { id?: number; first_name?: string; last_name?: string; username?: string; photo_url?: string }

interface TelegramWebApp {
  initData?: string;
  initDataUnsafe?: { user?: TelegramUser; start_param?: string };
  colorScheme?: 'light' | 'dark';
  MainButton?: TelegramMainButton;
  openTelegramLink?: (url: string) => void;
  ready?: () => void;
  expand?: () => void;
  close?: () => void;
  BackButton?: TelegramBackButton;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  HapticFeedback?: {
    notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
    impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    selectionChanged?: () => void;
  };
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

/** A light tap for selections / toggles. */
export function hapticTap(): void {
  safe(() => webApp()?.HapticFeedback?.selectionChanged?.());
}

/** The Telegram user (name, photo) — null outside Telegram. */
export function telegramUser(): TelegramUser | null {
  return webApp()?.initDataUnsafe?.user || null;
}

/** Telegram's own light/dark scheme, or null outside Telegram. */
export function telegramColorScheme(): 'light' | 'dark' | null {
  return webApp()?.colorScheme || null;
}

/** Inside a real Telegram client: the SDK got signed launch data. */
export const insideTelegram = (): boolean => !!webApp()?.initData;

/** Telegram's native bottom button, or null outside Telegram — also when the
    SDK is loaded in a plain browser, where it exists but is never shown —
    so callers render their own in-page button. */
export function mainButton(): TelegramMainButton | null {
  return insideTelegram() ? webApp()?.MainButton || null : null;
}

/**
 * Share text through Telegram's chat picker; outside Telegram the Web Share
 * sheet, else the clipboard. Resolves to how it was shared.
 */
export async function shareText(text: string, url = 'https://t.me/'): Promise<'telegram' | 'native' | 'copied' | 'failed'> {
  const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  const wa = webApp();
  if (wa?.openTelegramLink) { safe(() => wa.openTelegramLink?.(link)); return 'telegram'; }
  try {
    if (navigator.share) { await navigator.share({ text }); return 'native'; }
  } catch { /* cancelled → fall through to copy */ }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { return 'failed'; }
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
