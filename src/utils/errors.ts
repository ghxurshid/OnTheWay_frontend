/* Turns any thrown value into one sentence a user can act on, in the active
   language. Screens never show raw backend/transport text ("Failed to fetch",
   "HTTP 401", stack traces) — they call errorMessage(e). */

import { ApiError } from '@/api/client';
import { t } from '@/i18n';

/** Error codes raised by the app itself (not by the HTTP client). */
export type AppErrorCode = 'NO_INIT_DATA' | 'USER_OFFLINE' | 'REALTIME_OFFLINE';

/** An Error carrying an AppErrorCode, so errorMessage() can localize it. */
export const appError = (code: AppErrorCode, message = code): Error =>
  Object.assign(new Error(message), { code });

const codeOf = (e: unknown): string | undefined => (e as { code?: string } | null)?.code;

/** A localized, actionable message for `e`; `fallbackKey` when nothing specific fits. */
export function errorMessage(e: unknown, fallbackKey = 'errors.generic'): string {
  if (e instanceof ApiError) {
    if (e.code === 'network') return t('errors.network');
    if (e.code === 'timeout') return t('errors.timeout');
    if (e.code === 'session' || e.status === 401) return t('errors.session');
    if (e.status === 400) return t('errors.validation');
    if (e.status === 403) return t('errors.forbidden');
    if (e.status === 404) return t('errors.notFound');
    if (e.status === 409) return t('errors.conflict');
    if (e.status === 503) return t('errors.serviceDown');
    if (e.status >= 500) return t('errors.server');
  }
  const code = codeOf(e);
  if (code === 'NO_INIT_DATA') return t('errors.openInTelegram');
  if (code === 'USER_OFFLINE') return t('errors.userOffline');
  if (code === 'REALTIME_OFFLINE') return t('errors.realtimeOffline');

  const name = (e as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return t('errors.micDenied');
  if (name === 'NotFoundError' || name === 'NotReadableError') return t('errors.noMic');
  // SignalR surfaces a server HubException as "… HubException: CODE".
  const text = (e as Error | null)?.message || '';
  if (text.includes('USER_OFFLINE')) return t('errors.userOffline');
  if (e instanceof TypeError) return t('errors.network');
  return t(fallbackKey);
}

/** True for a 409 — the request conflicts with what already exists. */
export const isConflict = (e: unknown): boolean => e instanceof ApiError && e.status === 409;

/** True when the server said the callee has no live connection. */
export const isUserOffline = (e: unknown): boolean =>
  codeOf(e) === 'USER_OFFLINE' || ((e as Error | null)?.message || '').includes('USER_OFFLINE');

/** Backend validation errors ("Field: message") as a map keyed by the lower-cased field. */
export function fieldErrors(e: unknown): Record<string, string> {
  if (!(e instanceof ApiError) || e.status !== 400) return {};
  const out: Record<string, string> = {};
  for (const line of e.errors) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return out;
}
