import { describe, it, expect } from 'vitest';
import { isHubRefusal, isRateLimited } from './retry';

/** What @microsoft/signalr rejects an invocation with when the hub throws HubException(code). */
const hubError = (code: string) =>
  new Error(`An unexpected error occurred invoking 'PublishRoute' on the server. HubException: ${code}`);

describe('outbox failure kinds', () => {
  it('a refusal is final — being asked to slow down is not', () => {
    expect(isHubRefusal(hubError('invalid_route'))).toBe(true);
    expect(isHubRefusal(hubError('route_too_long'))).toBe(true);
    expect(isHubRefusal(new Error("Failed to invoke 'SetWalkerAlert' due to an error on the server."))).toBe(true);

    expect(isHubRefusal(hubError('rate_limited'))).toBe(false);
    expect(isHubRefusal(new Error('Invocation canceled due to the underlying connection being closed.'))).toBe(false);
  });

  it('a rate limit is recognised from the socket and from REST', () => {
    expect(isRateLimited(hubError('rate_limited'))).toBe(true);
    expect(isRateLimited(Object.assign(new Error('Too many requests. Please slow down.'), { status: 429 }))).toBe(true);

    expect(isRateLimited(hubError('user_blocked'))).toBe(false);
    expect(isRateLimited(Object.assign(new Error('Conflict'), { status: 409 }))).toBe(false);
    expect(isRateLimited(null)).toBe(false);
  });
});
