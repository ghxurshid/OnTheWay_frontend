import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, ApiError } from './client';

// Minimal Response stub matching what parse() reads (status, ok, text()).
function res(status, bodyObj) {
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
