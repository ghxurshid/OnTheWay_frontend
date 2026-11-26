/* ════════════════════════════════════════════════════════════════
   SERVICE — my settings. The server (/settings) is the truth; this device
   mirrors it (language, theme, the notification switches that gate toasts).
   Synced at boot and whenever the settings screen opens.

   Everything runs one at a time, so a load and a save can never overtake
   each other. A change is applied at once and kept (persisted) until the
   server has it, so a change made offline — or while a load is on its way —
   is not undone by what the server still says.

   The first sync on a device settles a clash: GET /settings answers defaults
   (theme Light, language Uzbek) for a user who never chose, while the device
   already follows Telegram's colour scheme. A default value on the server
   cannot be told from a chosen one, so there the device's value wins and is
   written through, once. A non-default value was chosen, and the server wins.
   Every field is sent on save — the ones no screen here shows survive.
   ════════════════════════════════════════════════════════════════ */

import { ApiError } from '@/api/client';
import { DEFAULT_SETTINGS, settingsApi } from '@/api/settingsApi';
import { themeStore } from '@/constants/theme';
import { i18nStore } from '@/i18n';
import type { Lang } from '@/i18n';
import { readJson, writeJson } from '@/utils/storage';
import type { NotificationSettings, UserSettings } from '@/models';
import { prefsStore } from './prefsStore';

const SEEDED_KEY = 'otw-settings-seeded';
const PENDING_KEY = 'otw-settings-pending';

// UI language code ⇄ backend AppLanguage name.
const LANG_TO_BACKEND: Record<Lang, string> = { uz: 'Uzbek', ru: 'Russian', en: 'English' };
const BACKEND_TO_LANG: Record<string, Lang> = { Uzbek: 'uz', Russian: 'ru', English: 'en' };

/** A change to the settings; what it does not name stays as it is. */
export interface SettingsPatch {
  theme?: string;
  language?: string;
  notifications?: Partial<NotificationSettings>;
}

/** The three switches the app shows. */
export interface NotifSwitches { match: boolean; chat: boolean; agree: boolean }

let latest: UserSettings | null = null;
let pending: SettingsPatch | null = readJson<SettingsPatch | null>(PENDING_KEY, null);

const setPending = (next: SettingsPatch | null): void => {
  pending = next;
  writeJson(PENDING_KEY, next);
};

const combine = (a: SettingsPatch | null, b: SettingsPatch): SettingsPatch => {
  const notifications = { ...a?.notifications, ...b.notifications };
  return { ...a, ...b, ...(Object.keys(notifications).length ? { notifications } : {}) };
};

const withPatch = (base: UserSettings, patch: SettingsPatch | null): UserSettings =>
  (patch ? { ...base, ...patch, notifications: { ...base.notifications, ...patch.notifications } } : base);

const themeName = (): string => (themeStore.mode === 'dark' ? 'Dark' : 'Light');

/** First sync on this device: its values for what the server only has by default. */
function seedFromDevice(server: UserSettings): SettingsPatch | null {
  const seed: SettingsPatch = {};
  if (server.theme === DEFAULT_SETTINGS.theme && server.theme !== themeName()) seed.theme = themeName();
  const language = LANG_TO_BACKEND[i18nStore.mode];
  if (server.language === DEFAULT_SETTINGS.language && server.language !== language) seed.language = language;
  return Object.keys(seed).length ? seed : null;
}

/** Mirror the settings into the stores the app reads synchronously. */
function applyToDevice(s: UserSettings): void {
  const lang = BACKEND_TO_LANG[s.language];
  if (lang && i18nStore.mode !== lang) i18nStore.set(lang);
  const theme = s.theme === 'Dark' ? 'dark' : 'light';
  if (themeStore.mode !== theme) themeStore.set(theme);
  const n = s.notifications;
  if (!n) return;
  const p = prefsStore.get();
  const notifMatch = n.matching ?? true;
  const notifChat = n.messages ?? true;
  const notifAgree = n.agreementRequests ?? true;
  if (p.notifMatch !== notifMatch || p.notifChat !== notifChat || p.notifAgree !== notifAgree) {
    prefsStore.patch({ notifMatch, notifChat, notifAgree });
  }
}

// One at a time, in the order asked.
let tail: Promise<unknown> = Promise.resolve();
function inOrder<R>(task: () => Promise<R>): Promise<R> {
  const run = tail.then(task, task);
  tail = run.catch(() => undefined);
  return run;
}

/** Send what the server does not have yet, on top of what it has. Never on a
    guess: without the server's copy the fields not shown here would be lost. */
async function flushPending(): Promise<void> {
  const sent = pending;
  if (!sent) return;
  const base = latest ?? (await settingsApi.get() as UserSettings | null) ?? DEFAULT_SETTINGS;
  const next = withPatch(base, sent);
  try {
    latest = (await settingsApi.update(next as unknown as Record<string, unknown>) as UserSettings | null) ?? next;
  } catch (e) {
    // Refused for good (a bad value): nothing more to do. Otherwise — offline, a session
    // being renewed, asked to slow down (429), server trouble — it waits for the next sync.
    const refused = e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429 && e.code !== 'session';
    if (!refused) throw e;
  }
  if (pending === sent) setPending(null);
}

async function load(): Promise<UserSettings | null> {
  const server = await settingsApi.get() as UserSettings | null;
  if (!server) return null; // demo mode, nothing saved yet: the device's values stand
  latest = server;
  if (!readJson<boolean>(SEEDED_KEY, false)) {
    const seed = seedFromDevice(server);
    if (seed) setPending(combine(seed, pending || {})); // a change the user made still wins
    writeJson(SEEDED_KEY, true);
  }
  await flushPending().catch(() => { /* offline: the device keeps its values, retried next sync */ });
  const shown = withPatch(latest, pending);
  applyToDevice(shown);
  return shown;
}

let syncing: Promise<UserSettings | null> | null = null;

function save(patch: SettingsPatch): void {
  setPending(combine(pending, patch));
  inOrder(flushPending).catch(() => { /* kept; retried on the next sync */ });
}

export const settingsService = {
  /** Fetch the settings and mirror them on this device. Resolves to what is now
      in effect (null in demo mode before anything was saved); rejects when the
      server cannot be reached — the local values then stand. */
  sync(): Promise<UserSettings | null> {
    if (!syncing) syncing = inOrder(load).finally(() => { syncing = null; });
    return syncing;
  },

  setLanguage(lang: Lang): void {
    i18nStore.set(lang);
    save({ language: LANG_TO_BACKEND[lang] });
  },

  setTheme(dark: boolean): void {
    themeStore.set(dark ? 'dark' : 'light');
    save({ theme: dark ? 'Dark' : 'Light' });
  },

  /** The switches shown in Settings. "Agreement" covers both agreement categories. */
  setNotifications({ match, chat, agree }: NotifSwitches): void {
    prefsStore.patch({ notifMatch: match, notifChat: chat, notifAgree: agree });
    save({ notifications: { matching: match, messages: chat, agreementRequests: agree, agreementAccepted: agree } });
  },
};
