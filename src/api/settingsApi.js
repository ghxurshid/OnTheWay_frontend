/* REPOSITORY — per-user application settings (/settings).
   Mirrors the backend SettingsDto: search mode, theme, language, the search
   result limit and per-category notification toggles. */

import { USE_MOCKS, mockResponse, http } from './client';

const MOCK_SETTINGS = {
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
    if (USE_MOCKS) return mockResponse(MOCK_SETTINGS);
    return http('/settings');
  },

  /** PUT /settings — persist the caller's settings (created on first save). */
  update(settings) {
    if (USE_MOCKS) return mockResponse({ ...MOCK_SETTINGS, ...settings });
    return http('/settings', { method: 'PUT', body: JSON.stringify(settings) });
  },
};
