import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, send, ApiError } from './client';

// Minimal Response stub matching what parse() reads (status, ok, text()).
function res(status: number, bodyObj: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => (bodyObj == null ? '' : JSON.stringify(bodyObj)),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('ApiError', () => {
  it('carries status, message and errors', () => {
    const e = new ApiError(422, 'Invalid', ['field required']);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ApiError');
    expect(e.status).toBe(422);
    expect(e.errors).toEqual(['field required']);
  });
});

describe('http() envelope handling', () => {
  it('unwraps { success, data } to the bare payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(200, { success: true, data: { id: 7 } })));
    await expect(http('/thing', { auth: false })).resolves.toEqual({ id: 7 });
  });

  it('returns null on 204 No Content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(204, null)));
    await expect(http('/thing', { auth: false })).resolves.toBeNull();
  });

  it('keeps a coded 403 (errors[0] is the code, e.g. "user_blocked")', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(403, { success: false, message: 'Blocked.', errors: ['user_blocked'], data: null })));
    await expect(http('/chat/with/9/messages', { auth: false })).rejects.toMatchObject({
      name: 'ApiError', status: 403, errors: ['user_blocked'],
    });
  });

  it('throws ApiError with the envelope message/errors on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(400, { success: false, message: 'Bad input', errors: ['x'] })));
    await expect(http('/thing', { auth: false })).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'Bad input',
      errors: ['x'],
    });
  });

  it('throws ApiError when success:false even on a 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(200, { success: false, message: 'Nope' })));
    await expect(http('/thing', { auth: false })).rejects.toBeInstanceOf(ApiError);
  });
});

describe('send()', () => {
  it('sends the method with a JSON body', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => res(200, { success: true, data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(send('POST', '/things', { a: 1 }, { auth: false })).resolves.toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
  });

  it('omits the body when none is given', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => res(204, null));
    vi.stubGlobal('fetch', fetchMock);
    await send('DELETE', '/things/1', undefined, { auth: false });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });
});

describe('transport failures', () => {
  it('reports a lost connection as code "network"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(http('/thing', { auth: false })).rejects.toMatchObject({ name: 'ApiError', status: 0, code: 'network' });
  });

  it('gives up after the timeout with code "timeout"', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })));
    await expect(http('/slow', { auth: false, timeoutMs: 20 })).rejects.toMatchObject({ code: 'timeout' });
  });

  it('turns ProblemDetails into a message without the request URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(400, { title: 'One or more validation errors occurred.', errors: { name: ['Required'] } })));
    await expect(http('/thing', { auth: false })).rejects.toMatchObject({
      status: 400, message: 'One or more validation errors occurred.', errors: ['name: Required'],
    });
  });
});

describe('an expired session (401)', () => {
  /** A fresh module graph: the client and the session store it renews through. */
  async function load() {
    vi.resetModules();
    const client = await import('./client');
    const { authStore } = await import('@/services/authStore');
    return { ...client, authStore };
  }

  const expired = () => res(401, { success: false, message: 'Unauthorized' });

  beforeEach(() => { localStorage.clear(); });

  it('renews once and replays the request with the new token', async () => {
    const { http: fresh, authStore } = await load();
    authStore.set({ accessToken: 'old', refreshToken: 'r1' });
    authStore.setRefresher(async () => {
      authStore.set({ accessToken: 'new', refreshToken: 'r2' });
      return authStore.get()!;
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(res(200, { success: true, data: { ok: 1 } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fresh('/trips/mine')).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer new');
  });

  it.each([
    ['asked to slow down (429)', 429, undefined],
    ['offline', 0, 'network'],
    ['timed out', 0, 'timeout'],
    ['server trouble (503)', 503, undefined],
  ] as const)('keeps the session when renewal is only out of reach: %s', async (_name, status, code) => {
    const { http: fresh, authStore, ApiError: FreshApiError, SESSION_LOST_EVENT } = await load();
    authStore.set({ accessToken: 'old', refreshToken: 'r1' });
    const failure = new FreshApiError(status, 'renewal failed', [], code);
    authStore.setRefresher(async () => { throw failure; });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(expired()));
    const lost = vi.fn();
    window.addEventListener(SESSION_LOST_EVENT, lost);
    try {
      await expect(fresh('/trips/mine')).rejects.toBe(failure); // transient: retried later, session kept
      expect(authStore.getRefreshToken()).toBe('r1');
      expect(lost).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(SESSION_LOST_EVENT, lost);
    }
  });

  it('ends the session when the server refuses the renewal', async () => {
    const { http: fresh, authStore, ApiError: FreshApiError, SESSION_LOST_EVENT } = await load();
    authStore.set({ accessToken: 'old', refreshToken: 'r1' });
    authStore.setRefresher(async () => { throw new FreshApiError(401, 'Invalid Telegram initData.'); });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(expired()));
    const lost = vi.fn();
    window.addEventListener(SESSION_LOST_EVENT, lost);
    try {
      await expect(fresh('/trips/mine')).rejects.toMatchObject({ status: 401, code: 'session' });
      expect(authStore.get()).toBeNull();
      expect(lost).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(SESSION_LOST_EVENT, lost);
    }
  });
});
