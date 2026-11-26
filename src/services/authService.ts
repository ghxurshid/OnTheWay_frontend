/* ════════════════════════════════════════════════════════════════
   AUTH SERVICE — owns the login/refresh lifecycle.
   Wires the session-renewal strategy into authStore (so the HTTP client
   and the realtime hubs can recover from an expired token) and exposes a
   single `ensureAuth()` the app awaits at startup.

   Renewal: the rotating refresh token first; if that is gone or rejected,
   a fresh sign-in with the Telegram initData the Mini App was opened with.
   Only when both fail is the session lost (the app then asks the user to
   reopen it).
   ════════════════════════════════════════════════════════════════ */

import { authApi } from '@/api/authApi';
import { ApiError } from '@/api/client';
import { appError } from '@/utils/errors';
import { authStore } from './authStore';
import type { AuthSession } from './authStore';
import { getInitData } from './telegram';

/** Sign in with the current Telegram initData and persist the session. */
async function loginSession(): Promise<AuthSession> {
  const initData = getInitData();
  if (!initData) {
    if (import.meta.env?.DEV) {
      console.warn('[auth] No Telegram initData: open the app inside Telegram, or set VITE_TG_INIT_DATA in .env.local for local testing.');
    }
    throw appError('NO_INIT_DATA');
  }
  const session = await authApi.telegram(initData);
  authStore.set(session);
  return session;
}

/** The refresh token could not be checked right now — offline, timed out, or the
    server asked us to slow down. A fresh Telegram sign-in would hit the same wall,
    and the token may well still be good: try again later instead. */
const renewalOutOfReach = (e: unknown): boolean =>
  e instanceof ApiError && (e.code === 'network' || e.code === 'timeout' || e.status === 429);

authStore.setRefresher(async () => {
  const token = authStore.getRefreshToken();
  if (token) {
    try {
      const session = await authApi.refresh(token);
      authStore.set(session);
      return session;
    } catch (e) {
      if (renewalOutOfReach(e)) throw e;
      /* rotated/expired refresh token (or server trouble) → fall back to a fresh Telegram login */
    }
  }
  return loginSession();
});

/**
 * Guarantee an authenticated session for the rest of the app.
 *  - valid token → reuse it
 *  - otherwise   → renew (refresh token, then Telegram login)
 */
export async function ensureAuth(): Promise<unknown> {
  if (authStore.isAuthenticated() && !authStore.isAccessTokenExpired()) {
    return authStore.getUser();
  }
  return (await authStore.refresh()).user;
}

/** The signed-in user's display name (from the session), or null. */
export function currentUserName(): string | null {
  const user = authStore.getUser() as { fullName?: string } | null;
  return user?.fullName?.trim() || null;
}
