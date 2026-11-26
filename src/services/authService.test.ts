import { describe, it, expect, vi, beforeEach } from 'vitest';

const api = vi.hoisted(() => ({ refresh: vi.fn(), telegram: vi.fn() }));
vi.mock('@/api/authApi', () => ({ authApi: api }));
vi.mock('./telegram', () => ({ getInitData: () => 'query_id=1&user=%7B%22id%22%3A7%7D&hash=abc' }));

/** A fresh module graph with the renewal strategy registered. */
async function load() {
  vi.resetModules();
  const { ApiError } = await import('@/api/client');
  const { authStore } = await import('./authStore');
  await import('./authService'); // registers the refresher
  return { ApiError, authStore };
}

const session = (n: number) => ({ accessToken: `a${n}`, refreshToken: `r${n}` });

beforeEach(() => {
  localStorage.clear();
  api.refresh.mockReset();
  api.telegram.mockReset();
});

describe('session renewal', () => {
  it('rotates the refresh token', async () => {
    const { authStore } = await load();
    authStore.set(session(1));
    api.refresh.mockResolvedValue(session(2));

    await authStore.refresh();

    expect(api.refresh).toHaveBeenCalledWith('r1');
    expect(api.telegram).not.toHaveBeenCalled();
    expect(authStore.getAccessToken()).toBe('a2');
  });

  it('signs in afresh with Telegram when the refresh token is refused', async () => {
    const { ApiError, authStore } = await load();
    authStore.set(session(1));
    api.refresh.mockRejectedValue(new ApiError(401, 'Invalid refresh token.'));
    api.telegram.mockResolvedValue(session(3));

    await authStore.refresh();

    expect(api.telegram).toHaveBeenCalledTimes(1);
    expect(authStore.getAccessToken()).toBe('a3');
  });

  it('does not sign in afresh while renewal is out of reach (429 / offline): the token may still be good', async () => {
    const { ApiError, authStore } = await load();
    authStore.set(session(1));
    const slowDown = new ApiError(429, 'Too many requests. Please slow down.');
    api.refresh.mockRejectedValueOnce(slowDown).mockRejectedValueOnce(new ApiError(0, 'Network request failed.', [], 'network'));

    await expect(authStore.refresh()).rejects.toBe(slowDown);
    await expect(authStore.refresh()).rejects.toMatchObject({ code: 'network' });

    expect(api.telegram).not.toHaveBeenCalled();
    expect(authStore.getRefreshToken()).toBe('r1');
  });
});
