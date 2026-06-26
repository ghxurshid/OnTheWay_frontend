/* REPOSITORY — authentication endpoints (/auth/*).
   These never carry a Bearer token (auth:false) and are excluded from the
   401-refresh loop to avoid recursion. Each returns the unwrapped
   AuthenticationResponseDto: { accessToken, accessTokenExpiresAt,
   refreshToken, user }. */

import { http } from './client';

export const authApi = {
  /** POST /auth/telegram — exchange signed Telegram initData for a token pair. */
  telegram(initData) {
    return http('/auth/telegram', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ initData }),
    });
  },

  /** POST /auth/refresh — rotate the refresh token for a new pair. */
  refresh(refreshToken) {
    return http('/auth/refresh', {
      method: 'POST',
      auth: false,
      _retried: true, // a failed refresh must not trigger another refresh
      body: JSON.stringify({ refreshToken }),
    });
  },
};
