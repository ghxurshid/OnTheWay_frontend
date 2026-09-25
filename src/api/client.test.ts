import { describe, it, expect, vi, afterEach } from 'vitest';
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
