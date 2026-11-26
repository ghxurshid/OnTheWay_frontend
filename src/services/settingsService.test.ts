import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserSettings } from '@/models';

const api = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock('@/api/settingsApi', async (original) => ({
  ...(await original<typeof import('@/api/settingsApi')>()),
  settingsApi: api,
}));

const DEFAULTS: UserSettings = {
  searchMode: 'Drivers', theme: 'Light', language: 'Uzbek', searchResultLimit: 20,
  notifications: { matching: true, messages: true, agreementRequests: true, agreementAccepted: true, tripUpdates: true, promotional: false },
};

/** What the fake server holds; PUT replaces it. */
let server: UserSettings;

/** Fresh modules on a device with this theme / language picked already. */
async function load(device: { theme?: string; lang?: string } = {}) {
  vi.resetModules();
  if (device.theme) localStorage.setItem('otw-theme', device.theme);
  if (device.lang) localStorage.setItem('otw-lang', device.lang);
  const { settingsService } = await import('./settingsService');
  const { themeStore } = await import('@/constants/theme');
  const { i18nStore } = await import('@/i18n');
  const { prefsStore } = await import('./prefsStore');
  return { settingsService, themeStore, i18nStore, prefsStore };
}

const settled = () => new Promise((resolve) => { setTimeout(resolve, 0); });

beforeEach(() => {
  localStorage.clear();
  server = { ...DEFAULTS, notifications: { ...DEFAULTS.notifications } };
  api.get.mockReset().mockImplementation(async () => server);
  api.update.mockReset().mockImplementation(async (next: UserSettings) => { server = next; return next; });
});

describe('at boot', () => {
  it('mirrors the switches that gate toasts, the language and the theme', async () => {
    server = { ...server, theme: 'Dark', language: 'Russian',
      notifications: { ...server.notifications, matching: false, messages: false, agreementRequests: false } };
    const { settingsService, themeStore, i18nStore, prefsStore } = await load({ theme: 'light', lang: 'uz' });

    await settingsService.sync();

    expect(prefsStore.get()).toMatchObject({ notifMatch: false, notifChat: false, notifAgree: false });
    expect(i18nStore.mode).toBe('ru');
    expect(themeStore.mode).toBe('dark');
    expect(api.update).not.toHaveBeenCalled();
  });

  it('a load that fails leaves the local values', async () => {
    api.get.mockRejectedValue(new Error('offline'));
    const { settingsService, themeStore } = await load({ theme: 'dark' });
    await expect(settingsService.sync()).rejects.toThrow('offline');
    expect(themeStore.mode).toBe('dark');
  });
});

describe('the first sync on a device (GET answers defaults for someone who never chose)', () => {
  it('a dark device does not flip to the default Light: its theme goes to the server, once', async () => {
    const { settingsService, themeStore } = await load({ theme: 'dark' });

    await settingsService.sync();

    expect(themeStore.mode).toBe('dark');
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.update.mock.calls[0][0]).toEqual({ ...DEFAULTS, theme: 'Dark' }); // nothing else lost

    await settingsService.sync(); // the settings screen opens later
    expect(themeStore.mode).toBe('dark');
    expect(api.update).toHaveBeenCalledTimes(1);
  });

  it('only once: afterwards the server decides, also when it says Light', async () => {
    let { settingsService, themeStore } = await load({ theme: 'dark' });
    await settingsService.sync();
    server = { ...server, theme: 'Light' }; // changed on another device

    ({ settingsService, themeStore } = await load());
    await settingsService.sync();

    expect(themeStore.mode).toBe('light');
    expect(api.update).toHaveBeenCalledTimes(1);
  });

  it('a value chosen on the server wins on a new device', async () => {
    server = { ...server, theme: 'Dark', language: 'English' };
    const { settingsService, themeStore, i18nStore } = await load({ theme: 'light', lang: 'uz' });

    await settingsService.sync();

    expect(themeStore.mode).toBe('dark');
    expect(i18nStore.mode).toBe('en');
    expect(api.update).not.toHaveBeenCalled();
  });

  it('a language chosen in the bot wins while the unchosen theme still follows the device', async () => {
    server = { ...server, language: 'Russian' };
    const { settingsService, themeStore, i18nStore } = await load({ theme: 'dark', lang: 'uz' });

    await settingsService.sync();

    expect(i18nStore.mode).toBe('ru');
    expect(themeStore.mode).toBe('dark');
    expect(api.update.mock.calls[0][0]).toMatchObject({ theme: 'Dark', language: 'Russian' });
  });

  it('a failed write-through is retried; the device keeps its theme meanwhile', async () => {
    api.update.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    let { settingsService, themeStore } = await load({ theme: 'dark' });
    await settingsService.sync();
    expect(themeStore.mode).toBe('dark');

    ({ settingsService, themeStore } = await load()); // even after a restart
    await settingsService.sync();
    expect(api.update).toHaveBeenCalledTimes(2);
    expect(server.theme).toBe('Dark');
    expect(themeStore.mode).toBe('dark');
  });
});

describe('saving', () => {
  it('keeps the fields no screen here shows', async () => {
    server = { ...server, searchMode: 'Passengers', searchResultLimit: 50,
      notifications: { ...server.notifications, tripUpdates: false, promotional: true } };
    const { settingsService } = await load({ theme: 'light' });
    await settingsService.sync();

    settingsService.setTheme(true);
    settingsService.setNotifications({ match: false, chat: true, agree: false });
    await settled();

    expect(server).toEqual({
      searchMode: 'Passengers', searchResultLimit: 50, theme: 'Dark', language: 'Uzbek',
      notifications: { matching: false, messages: true, agreementRequests: false, agreementAccepted: false, tripUpdates: false, promotional: true },
    });
  });

  it('a change made before the first load merges onto the server copy (no guessing)', async () => {
    server = { ...server, searchResultLimit: 50 };
    const { settingsService, themeStore } = await load({ theme: 'light' });

    settingsService.setTheme(true);
    await settled();

    expect(themeStore.mode).toBe('dark');
    expect(server).toMatchObject({ theme: 'Dark', searchResultLimit: 50 });
  });

  it('race: a change made while the load is on its way is not undone by it', async () => {
    let answer!: (s: UserSettings) => void;
    api.get.mockImplementationOnce(() => new Promise((res) => { answer = res; }));
    const { settingsService, themeStore } = await load({ theme: 'light' });
    localStorage.setItem('otw-settings-seeded', 'true');

    const loading = settingsService.sync();
    settingsService.setTheme(true); // the user toggles; the server still says Light
    await settled();
    answer(server);
    await loading;
    await settled();

    expect(themeStore.mode).toBe('dark');
    expect(server.theme).toBe('Dark');
  });

  it('two loads at once ask the server once', async () => {
    const { settingsService } = await load({ theme: 'light' });
    await Promise.all([settingsService.sync(), settingsService.sync()]);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('a change the server asked to slow down on (429) waits for the next sync — it is not dropped', async () => {
    let { settingsService, themeStore } = await load({ theme: 'light' });
    const { ApiError } = await import('@/api/client'); // the same module graph as the service
    await settingsService.sync();
    api.update.mockRejectedValueOnce(new ApiError(429, 'Too many requests. Please slow down.'));
    settingsService.setTheme(true);
    await settled();
    expect(server.theme).toBe('Light');

    ({ settingsService, themeStore } = await load()); // the next launch
    await settingsService.sync();
    expect(server.theme).toBe('Dark');
    expect(themeStore.mode).toBe('dark');
  });

  it('a change made offline survives until the server has it', async () => {
    api.update.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    let { settingsService, themeStore } = await load({ theme: 'light' });
    await settingsService.sync();
    settingsService.setTheme(true);
    await settled();
    expect(server.theme).toBe('Light');

    ({ settingsService, themeStore } = await load());
    await settingsService.sync();
    expect(server.theme).toBe('Dark');
    expect(themeStore.mode).toBe('dark');
  });
});
