/* ════════════════════════════════════════════════════════════════
   TELEGRAM MINI APP bridge.
   ────────────────────────────────────────────────────────────────
   Thin accessor over `window.Telegram.WebApp`. The only value the backend
   needs is the raw signed `initData` string, which it HMAC-verifies on
   /auth/telegram. Outside Telegram (plain browser during development) the
   SDK is absent, so we fall back to VITE_TG_INIT_DATA.
   ════════════════════════════════════════════════════════════════ */

const env = import.meta.env || {};

interface TelegramWebApp {
  initData?: string;
  initDataUnsafe?: { user?: unknown };
  ready?: () => void;
  expand?: () => void;
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

/** Signal Telegram we're ready and expand to full height. Safe to call always. */
export function initTelegramUi(): void {
  const wa = webApp();
  try {
    wa?.ready?.();
    wa?.expand?.();
  } catch {
    /* older Telegram clients may not expose every method */
  }
}
