/* REPOSITORY — authentication endpoints (/auth/*).
   These never carry a Bearer token (auth:false) and are excluded from the
   401-refresh loop to avoid recursion. Each returns the unwrapped
   AuthenticationResponseDto: { accessToken, accessTokenExpiresAt,
   refreshToken, user }. */

import { send } from './client';

export const authApi = {
  /** POST /auth/telegram — exchange signed Telegram initData for a token pair. */
  telegram(initData: string) {
    return send('POST', '/auth/telegram', { initData }, { auth: false });
  },

  /** POST /auth/refresh — rotate the refresh token for a new pair. */
  refresh(refreshToken: string) {
    // _retried: a failed refresh must not trigger another refresh.
    return send('POST', '/auth/refresh', { refreshToken }, { auth: false, _retried: true });
  },
};
