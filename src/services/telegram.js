/* ════════════════════════════════════════════════════════════════
   TELEGRAM MINI APP bridge.
   ────────────────────────────────────────────────────────────────
   Thin accessor over `window.Telegram.WebApp`. The only value the backend
   needs is the raw signed `initData` string, which it HMAC-verifies on
   /auth/telegram. Outside Telegram (plain browser during development) the
   SDK is absent, so we fall back to VITE_TG_INIT_DATA — paste a captured
   initData string into .env.local to test the real auth flow locally.
   ════════════════════════════════════════════════════════════════ */

const env = import.meta.env || {};

/** The Telegram.WebApp object, or null when not running inside Telegram. */
export function webApp() {
  return (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) || null;
}

/** True when launched inside the Telegram client. */
export function isTelegram() {
  const wa = webApp();
  return !!(wa && wa.initData);
}

/**
 * Raw signed initData to forward to the backend. Prefers the real Telegram
 * value; falls back to the dev override so the app is testable in a browser.
 */
export function getInitData() {
  const wa = webApp();
  if (wa && wa.initData) return wa.initData;
  return env.VITE_TG_INIT_DATA || '';
}

/** The unsafe (client-side, unverified) user — handy for instant UI only. */
export function getUnsafeUser() {
  return webApp()?.initDataUnsafe?.user || null;
}

/** Signal Telegram we're ready and expand to full height. Safe to call always. */
export function initTelegramUi() {
  const wa = webApp();
  if (!wa) return;
  try {
    wa.ready();
    wa.expand();
  } catch {
    /* older Telegram clients may not expose every method */
  }
}
