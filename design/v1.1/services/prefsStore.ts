/* ════════════════════════════════════════════════════════════════
   PREFS STORE — client-only preferences and profile extras.
   Persisted in localStorage and announced with PREFS_EVENT (read in React
   through `usePrefs`). Server-backed settings (language, theme, notification
   switches) stay in settingsApi; the switches are mirrored here so in-app
   toasts can respect them without a round-trip.
   ════════════════════════════════════════════════════════════════ */

import { readJson, writeJson, notifyStoreChange } from '@/utils/storage';
import type { PartyType } from '@/models';

/** How other people are drawn on the map. */
export type MarkerStyle = 'initials' | 'icons';

/** A driver's car, shown on their card so a passenger can recognise it. */
export interface VehicleInfo { model: string; color: string; plate: string; seats: number }

export interface Prefs {
  markerStyle: MarkerStyle;
  /** Only calls and ride agreements raise a toast. */
  quiet: boolean;
  notifMatch: boolean;
  notifChat: boolean;
  notifAgree: boolean;
  /** Role picked last time — the app opens straight onto the map in it. */
  lastRole: PartyType | null;
  /** The first-run introduction has been seen. */
  onboarded: boolean;
  vehicle: VehicleInfo | null;
}

export const PREFS_EVENT = 'ontheway:prefs';
const KEY = 'otw-prefs';

const DEFAULTS: Prefs = {
  markerStyle: 'initials', quiet: false, notifMatch: true, notifChat: true, notifAgree: true,
  lastRole: null, onboarded: false, vehicle: null,
};

let cache: Prefs = { ...DEFAULTS, ...readJson<Partial<Prefs>>(KEY, {}) };

export const prefsStore = {
  get(): Prefs { return cache; },
  patch(p: Partial<Prefs>): Prefs {
    cache = { ...cache, ...p };
    writeJson(KEY, cache);
    notifyStoreChange(PREFS_EVENT);
    return cache;
  },
};

/** "Chevrolet Cobalt · oq · 01 A 777 BB" — the one-line form the backend stores. */
export const vehicleLine = (v: VehicleInfo | null | undefined): string =>
  v ? [v.model, v.color, v.plate].map((s) => s.trim()).filter(Boolean).join(' · ') : '';
