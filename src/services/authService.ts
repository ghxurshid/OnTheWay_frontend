/* ════════════════════════════════════════════════════════════════
   AUTH SERVICE — owns the login/refresh lifecycle.
   Wires the refresh implementation into authStore (so the HTTP client can
   recover from 401s) and exposes a single `ensureAuth()` the app awaits at
   startup before showing authenticated screens.
   ════════════════════════════════════════════════════════════════ */

import { authApi } from '@/api/authApi';
import { authStore } from './authStore';
import { getInitData } from './telegram';

// Register the concrete refresh strategy so authStore.refresh() (called by the
// HTTP client on 401) knows how to obtain a fresh session.
authStore.setRefresher(async () => {
  const token = authStore.getRefreshToken();
  if (!token) throw new Error('No refresh token');
  const session = await authApi.refresh(token);
  authStore.set(session);
  return session;
});

/** Sign in with the current Telegram initData and persist the session. */
export async function login(): Promise<unknown> {
  const initData = getInitData();
  if (!initData) {
    throw new Error(
      'Telegram initData topilmadi. Ilovani Telegram orqali oching yoki ' +
      'lokal test uchun .env.local ga VITE_TG_INIT_DATA qo\'shing.',
    );
  }
  const session = await authApi.telegram(initData);
  authStore.set(session);
  return session.user;
}

/**
 * Guarantee an authenticated session for the rest of the app.
 *  - valid token        → reuse it
 *  - expired but has RT → refresh
 *  - otherwise          → fresh Telegram login
 */
export async function ensureAuth(): Promise<unknown> {
  if (authStore.isAuthenticated() && !authStore.isAccessTokenExpired()) {
    return authStore.getUser();
  }
  if (authStore.getRefreshToken()) {
    try {
      const session = await authStore.refresh();
      return session.user;
    } catch {
      /* refresh failed (expired/rotated) → fall through to a fresh login */
    }
  }
  return login();
}

export function logout(): void {
  authStore.clear();
}

export function currentUser(): unknown {
  return authStore.getUser();
}
