import { useState } from 'react';
import { T, themeStore } from '@/constants/theme';
import { t, i18nStore } from '@/i18n';
import { SettSection, SettToggleRow } from '@/components/ui/Settings';
import { SimCountRow } from './SimCountRow';

/** Settings body: language, appearance, walker count, notifications. */
export function SettingsPanel() {
  const [lang, setLang] = useState(i18nStore.mode);
  const [notif, setNotif] = useState({ match: true, chat: true, promo: false });
  const [dark, setDark] = useState(themeStore.mode === 'dark');
  const setTheme = (isDark) => { setDark(isDark); themeStore.set(isDark ? 'dark' : 'light'); };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Language */}
      <SettSection title={t('settings.langSection')}>
        <div style={{ display: 'flex', gap: 6 }}>
          {i18nStore.langs.map((l) => (
            <button key={l.id} onClick={() => { setLang(l.id); i18nStore.set(l.id); }}
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
          onChange={(v) => setNotif((nn) => ({ ...nn, match: v }))} icon="🔔" color={T.teal} />
        <SettToggleRow label={t('settings.notifChat')} sub={t('settings.notifChatSub')} value={notif.chat}
          onChange={(v) => setNotif((nn) => ({ ...nn, chat: v }))} icon="💬" color={T.amber} />
        <SettToggleRow label={t('settings.notifPromo')} sub={t('settings.notifPromoSub')} value={notif.promo}
          onChange={(v) => setNotif((nn) => ({ ...nn, promo: v }))} icon="🎁" color={T.purple} />
      </SettSection>

      <div style={{ textAlign: 'center', fontSize: 11, color: T.muted, marginTop: 4 }}>
        OnTheWay v1.0.0 · © 2025
      </div>
    </div>
  );
}
