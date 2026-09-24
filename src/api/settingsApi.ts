/* REPOSITORY — per-user application settings (/settings).
   Mirrors the backend SettingsDto: search mode, theme, language, the search
   result limit and per-category notification toggles. */

import { USE_MOCKS, mockResponse, http, send } from './client';
import type { UserSettings } from '@/models';

/** The backend's defaults for a user who never customised anything. */
export const DEFAULT_SETTINGS: UserSettings = {
  searchMode: 'Drivers',
  theme: 'Light',
  language: 'Uzbek',
  searchResultLimit: 20,
  notifications: {
    matching: true, messages: true, agreementRequests: true,
    agreementAccepted: true, tripUpdates: true, promotional: false,
  },
};

export const settingsApi = {
  /** GET /settings — the caller's settings (defaults if never customised). */
  get() {
    if (USE_MOCKS) return mockResponse(DEFAULT_SETTINGS);
    return http('/settings');
  },

  /** PUT /settings — persist the caller's settings (created on first save). */
  update(settings: Record<string, unknown>) {
    if (USE_MOCKS) return mockResponse({ ...DEFAULT_SETTINGS, ...settings });
    return send('PUT', '/settings', settings);
  },
};
