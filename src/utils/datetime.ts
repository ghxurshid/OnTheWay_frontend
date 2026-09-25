/* Date / time helpers. Everything is formatted in the active UI language and
   in the device's LOCAL time zone (a "today" computed from UTC would be the
   previous day in Tashkent before 05:00). */

import { i18nStore, t } from '@/i18n';

// Reference timestamp for mock data only (demo trips/history render relative
// to app launch). UI code uses the current time.
export const NOW = new Date();

const LOCALES: Record<string, string> = { uz: 'uz-Latn-UZ', ru: 'ru-RU', en: 'en-GB' };

/** BCP-47 locale for the active UI language. */
export const locale = (): string => LOCALES[i18nStore.mode] || LOCALES.uz;

/** Build a Date for today at h:m (mock data). */
export const dt = (h: number, m: number): Date => { const d = new Date(NOW); d.setHours(h, m, 0, 0); return d; };

/** 24h HH:MM. */
export const fmt12 = (d: Date): string =>
  d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', hour12: false });

/** Short "dd mon" date. */
export const fmtDate = (d: Date): string => d.toLocaleDateString(locale(), { day: '2-digit', month: 'short' });

/** Hour label e.g. "08:00". */
export const hLabel = (h: number): string => `${String(h).padStart(2, '0')}:00`;

/** The LOCAL calendar date as YYYY-MM-DD. */
export function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's local date as YYYY-MM-DD. */
export const todayIso = (): string => isoDate(new Date());

/** YYYY-MM-DD `days` after today (local). */
export function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/** Whole days between today and `d` (0 today, 1 tomorrow, −1 yesterday). */
function dayOffset(d: Date): number {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(d); b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** "Today" / "Tomorrow" / "25 Sep". */
export function fmtDay(d: Date): string {
  const off = dayOffset(d);
  return off === 0 ? t('form.today') : off === 1 ? t('form.tomorrow') : fmtDate(d);
}

/** "Today, 08:15" / "Tomorrow, 08:15" / "25 Sep, 08:15". */
export const fmtDayTime = (d: Date): string => `${fmtDay(d)}, ${fmt12(d)}`;

/** "just now" / "5 min ago" / "today 10:15" / "yesterday 10:15" / "24 Sep". */
export function fmtLastSeen(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const minutes = Math.round((Date.now() - d.getTime()) / 60_000);
  if (minutes < 1) return t('time.justNow');
  if (minutes < 60) return t('time.minutesAgo', { n: minutes });
  const off = dayOffset(d);
  if (off === 0) return t('time.todayAt', { time: fmt12(d) });
  if (off === -1) return t('time.yesterdayAt', { time: fmt12(d) });
  return fmtDate(d);
}

/** Localized long month names (January…) and Monday-first short weekdays. */
export function calendarNames(): { months: string[]; weekdays: string[] } {
  const months = Array.from({ length: 12 }, (_, m) =>
    new Date(2024, m, 1).toLocaleDateString(locale(), { month: 'long' }));
  // 2024-01-01 was a Monday.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: 'short' }));
  return { months: months.map((m) => m.charAt(0).toUpperCase() + m.slice(1)), weekdays };
}
