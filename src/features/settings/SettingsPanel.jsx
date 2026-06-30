import { useState, useEffect, useRef } from 'react';
import { T, themeStore } from '@/constants/theme';
import { t, i18nStore } from '@/i18n';
import { SettSection, SettToggleRow } from '@/components/ui/Settings';
import { SimCountRow } from './SimCountRow';
import { settingsApi } from '@/api/settingsApi';

// UI language code ⇄ backend AppLanguage name.
const LANG_TO_BACKEND = { uz: 'Uzbek', ru: 'Russian', en: 'English' };
const BACKEND_TO_LANG = { Uzbek: 'uz', Russian: 'ru', English: 'en' };

/** Settings body: language, appearance, walker count, notifications. Backed by
    the /settings API (loaded on mount, persisted on every change); UI-only fields
    not shown here (e.g. search mode) are preserved across saves. */
export function SettingsPanel() {
  const [lang, setLang] = useState(i18nStore.mode);
  const [notif, setNotif] = useState({ match: true, chat: true, promo: false });
  const [dark, setDark] = useState(themeStore.mode === 'dark');
  // Full backend settings, so fields not surfaced in this panel survive a save.
  const server = useRef(null);

  useEffect(() => {
    let alive = true;
    settingsApi.get().then((s) => {
      if (!alive || !s) return;
      server.current = s;
      const code = BACKEND_TO_LANG[s.language] || 'uz';
      setLang(code);
      i18nStore.set(code);
      const isDark = s.theme === 'Dark';
      setDark(isDark);
      themeStore.set(isDark ? 'dark' : 'light');
      const n = s.notifications || {};
      setNotif({ match: n.matching ?? true, chat: n.messages ?? true, promo: n.promotional ?? false });
    }).catch(() => { /* offline / unauthenticated → keep local defaults */ });
    return () => { alive = false; };
  }, []);

  // Persist the merged settings, preserving fields this panel does not show.
  function persist(next) {
    const base = server.current || {
      searchMode: 'Drivers', searchResultLimit: 20,
      notifications: { matching: true, messages: true, agreementRequests: true,
        agreementAccepted: true, tripUpdates: true, promotional: false },
    };
    const merged = {
      searchMode: base.searchMode,
      searchResultLimit: base.searchResultLimit,
      theme: (next.dark ?? dark) ? 'Dark' : 'Light',
      language: LANG_TO_BACKEND[next.lang ?? lang] || 'Uzbek',
      notifications: {
        ...base.notifications,
        matching: next.notif ? next.notif.match : notif.match,
        messages: next.notif ? next.notif.chat : notif.chat,
        promotional: next.notif ? next.notif.promo : notif.promo,
      },
    };
    server.current = merged;
    settingsApi.update(merged).catch(() => { /* best-effort; UI already updated */ });
  }

  const changeLang = (id) => { setLang(id); i18nStore.set(id); persist({ lang: id }); };
  const setTheme = (isDark) => { setDark(isDark); themeStore.set(isDark ? 'dark' : 'light'); persist({ dark: isDark }); };
  const changeNotif = (patch) => setNotif((nn) => { const v = { ...nn, ...patch }; persist({ notif: v }); return v; });

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Language */}
      <SettSection title={t('settings.langSection')}>
        <div style={{ display: 'flex', gap: 6 }}>
          {i18nStore.langs.map((l) => (
            <button key={l.id} onClick={() => changeLang(l.id)}
              style={{ flex: 1, padding: '9px 0', borderRadius: 10,
                border: `1.5px solid ${lang === l.id ? T.teal + '60' : T.border}`,
                background: lang === l.id ? T.tealDim : 'transparent',
                color: lang === l.id ? T.teal : T.muted,
                fontSize: 12, fontWeight: lang === l.id ? 600 : 400,
                cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', transition: 'all .15s ease' }}>
              {l.label}
            </button>
          ))}
        </div>
      </SettSection>

      {/* Appearance */}
      <SettSection title={t('settings.appearance')}>
        <SettToggleRow label={t('settings.darkMode')} sub={dark ? t('settings.darkOn') : t('settings.darkOff')} value={dark} onChange={setTheme}
          icon={dark ? '🌙' : '☀️'} color={T.purple} />
      </SettSection>

      {/* Walker count (N) */}
      <SettSection title={t('settings.walkerSection')}>
        <SimCountRow />
      </SettSection>

      {/* Notifications */}
      <SettSection title={t('settings.notifSection')}>
        <SettToggleRow label={t('settings.notifMatch')} sub={t('settings.notifMatchSub')} value={notif.match}
          onChange={(v) => changeNotif({ match: v })} icon="🔔" color={T.teal} />
        <SettToggleRow label={t('settings.notifChat')} sub={t('settings.notifChatSub')} value={notif.chat}
          onChange={(v) => changeNotif({ chat: v })} icon="💬" color={T.amber} />
        <SettToggleRow label={t('settings.notifPromo')} sub={t('settings.notifPromoSub')} value={notif.promo}
          onChange={(v) => changeNotif({ promo: v })} icon="🎁" color={T.purple} />
      </SettSection>

      <div style={{ textAlign: 'center', fontSize: 11, color: T.muted, marginTop: 4 }}>
        OnTheWay v1.0.0 · © 2025
      </div>
    </div>
  );
}
