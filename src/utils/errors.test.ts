import { describe, it, expect, beforeEach } from 'vitest';
import { ApiError } from '@/api/client';
import { i18nStore, t } from '@/i18n';
import { MAX_OPEN_PLANS } from '@/constants/app';
import { appError, errorMessage, fieldErrors, isConflict, isOpenPlanLimit, isRateLimited, isUserBlocked, isUserOffline } from './errors';

beforeEach(() => i18nStore.set('en'));

describe('errorMessage', () => {
  it('never shows transport text to the user', () => {
    expect(errorMessage(new ApiError(0, 'Failed to fetch', [], 'network'))).toBe(t('errors.network'));
    expect(errorMessage(new ApiError(0, 'Request timed out.', [], 'timeout'))).toBe(t('errors.timeout'));
    expect(errorMessage(new TypeError('Failed to fetch'))).toBe(t('errors.network'));
  });

  it('maps HTTP statuses to actionable sentences', () => {
    expect(errorMessage(new ApiError(401, 'HTTP 401'))).toBe(t('errors.session'));
    expect(errorMessage(new ApiError(400, 'Validation failed.'))).toBe(t('errors.validation'));
    expect(errorMessage(new ApiError(404, 'Entity "Trip" (9) was not found.'))).toBe(t('errors.notFound'));
    expect(errorMessage(new ApiError(503, 'down'))).toBe(t('errors.serviceDown'));
    expect(errorMessage(new ApiError(500, 'boom'))).toBe(t('errors.server'));
  });

  it('localizes app codes, microphone errors and hub "offline" answers', () => {
    expect(errorMessage(appError('NO_INIT_DATA'))).toBe(t('errors.openInTelegram'));
    expect(errorMessage(Object.assign(new Error('x'), { name: 'NotAllowedError' }))).toBe(t('errors.micDenied'));
    const hub = new Error("An unexpected error occurred invoking 'InitiateCall'. HubException: USER_OFFLINE");
    expect(errorMessage(hub)).toBe(t('errors.userOffline'));
    expect(isUserOffline(hub)).toBe(true);
  });

  it('says the user cannot be contacted when a block stands between the two (REST or hub)', () => {
    // The backend's coded 403: { success: false, message, errors: ["user_blocked"] }.
    const rest = new ApiError(403, 'You cannot message this user.', ['user_blocked']);
    expect(errorMessage(rest)).toBe(t('errors.userBlocked'));
    expect(isUserBlocked(rest)).toBe(true);
    expect(isUserBlocked(new ApiError(403, 'user_blocked'))).toBe(true);
    expect(isUserBlocked(new Error("Failed to invoke 'SendMessage'. HubException: user_blocked"))).toBe(true);
    expect(isUserBlocked(new ApiError(403, 'You do not have permission to perform this action.'))).toBe(false);
    // A refused call: what signalR rejects InitiateCall with — not "offline", and never raw text.
    const call = new Error("An unexpected error occurred invoking 'InitiateCall' on the server. HubException: user_blocked");
    expect(errorMessage(call)).toBe(t('errors.userBlocked'));
    expect(isUserOffline(call)).toBe(false);
  });

  it('falls back to the given key', () => {
    expect(errorMessage(new Error('weird'), 'errors.sendFailed')).toBe(t('errors.sendFailed'));
  });

  it('asks to wait a moment when the server says slow down (REST 429 or hub rate_limited)', () => {
    const rest = new ApiError(429, 'Too many requests. Please slow down.');
    const hub = new Error("An unexpected error occurred invoking 'InitiateCall' on the server. HubException: rate_limited");
    expect(errorMessage(rest)).toBe(t('errors.rateLimited'));
    expect(errorMessage(hub, 'call.failedTitle')).toBe(t('errors.rateLimited'));
    expect(isRateLimited(rest)).toBe(true);
    expect(isRateLimited(hub)).toBe(true);
    expect(isRateLimited(new ApiError(409, 'Conflict'))).toBe(false);
    expect(isRateLimited(null)).toBe(false);
  });

  it('explains the open-plan limit — not as "already done" like other 409s', () => {
    // The backend's coded 409: { success: false, message, errors: ["open_plan_limit"] }.
    const rest = new ApiError(409, 'You already have 10 upcoming planned trips. Cancel one before publishing another.', ['open_plan_limit']);
    const limit = t('errors.openPlanLimit', { n: MAX_OPEN_PLANS });
    expect(limit).toContain(String(MAX_OPEN_PLANS));
    expect(errorMessage(rest)).toBe(limit);
    expect(errorMessage(appError('OPEN_PLAN_LIMIT'))).toBe(limit);
    expect(isOpenPlanLimit(rest)).toBe(true);
    expect(isOpenPlanLimit(appError('OPEN_PLAN_LIMIT'))).toBe(true);
    expect(isConflict(appError('OPEN_PLAN_LIMIT'))).toBe(false);
    expect(isOpenPlanLimit(new ApiError(409, 'You have already published this trip.', ['duplicate_trip']))).toBe(false);
    expect(isOpenPlanLimit(new ApiError(400, 'x', ['open_plan_limit']))).toBe(false);
    expect(errorMessage(new ApiError(409, 'dup', ['duplicate_trip']))).toBe(t('errors.conflict'));
  });
});

describe('fieldErrors / isConflict', () => {
  it('reads backend "Field: message" lines', () => {
    const e = new ApiError(400, 'Validation failed.', ['DepartureTimeUtc: Departure must be in the future.']);
    expect(fieldErrors(e)).toEqual({ departuretimeutc: 'Departure must be in the future.' });
    expect(fieldErrors(new ApiError(500, 'x'))).toEqual({});
  });

  it('detects 409', () => {
    expect(isConflict(new ApiError(409, 'dup'))).toBe(true);
    expect(isConflict(new ApiError(400, 'bad'))).toBe(false);
  });
});
