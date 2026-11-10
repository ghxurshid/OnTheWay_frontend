/* ════════════════════════════════════════════════════════════════
   ACCOUNT GUARD — one device, another Telegram account.
   ────────────────────────────────────────────────────────────────
   Telegram keeps one WebView storage per Mini App on a device, shared by
   every Telegram account signed in there. A session (and the outboxes,
   pending settings, alert wish, favourites…) saved by account A must never
   act for account B: B would reuse A's token and send A's queued writes.

   The session remembers which Telegram user it belongs to (authStore stamps
   it). Before any store loads, main.tsx calls `resetIfAccountChanged()`: on
   a definite mismatch every per-user key is wiped, so the app signs B in
   from scratch. Deliberately dependency-free — it must run before the
   modules that read localStorage at import time.
   ════════════════════════════════════════════════════════════════ */

const SESSION_KEY = 'otw-session';

/** Device preferences that belong to the phone, not to an account. */
const DEVICE_KEYS = new Set(['otw-lang', 'otw-theme', 'otw-theme-picked']);

/** Keys this app writes (both naming styles in use). */
const isAppKey = (key: string): boolean => key.startsWith('otw-') || key.startsWith('ontheway_');

interface TelegramWindow { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: number } } } } }

/** The Telegram user the Mini App was opened by, or null outside Telegram. */
export function currentTelegramUserId(): string | null {
  const id = (globalThis as TelegramWindow).Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return id != null ? String(id) : null;
}

/** Wipes the previous account's data when the app is opened by a different
    Telegram user. Returns true when it did. An older session that never
    recorded its user is kept (it is re-stamped on the next sign-in/refresh). */
export function resetIfAccountChanged(storage: Storage = globalThis.localStorage): boolean {
  try {
    const now = currentTelegramUserId();
    const raw = storage.getItem(SESSION_KEY);
    if (!now || !raw) return false;
    const owner = (JSON.parse(raw) as { telegramUserId?: string | null } | null)?.telegramUserId;
    if (owner == null || String(owner) === now) return false;
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && isAppKey(key) && !DEVICE_KEYS.has(key)) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
    return true;
  } catch {
    return false; // storage unavailable or corrupt: nothing to protect
  }
}
