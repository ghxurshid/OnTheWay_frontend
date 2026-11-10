import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { T, themeStore } from '@/constants/theme';
import { t, i18nStore } from '@/i18n';
import type { Lang } from '@/i18n';
import { SettSection, SettToggleRow } from '@/components/ui/Settings';
import { SimCountRow } from './SimCountRow';
import { BlockedUsersSection } from './BlockedUsersSection';
import { USE_MOCKS } from '@/api/client';
import { prefsStore } from '@/services/prefsStore';
import { settingsService } from '@/services/settingsService';
import type { MarkerStyle } from '@/services/prefsStore';
import { usePrefs } from '@/hooks/usePrefs';

/** Settings body: language, appearance (theme + map markers), notifications
    (+ quiet mode), blocked users and, in demo mode only, the simulated walker count. Backed by
    the /settings API through settingsService (refreshed on mount, persisted on
    every change); fields not shown here (e.g. search mode) survive every save. */
export function SettingsPanel() {
  const [lang, setLang] = useState<Lang>(i18nStore.mode);
  const prefs = usePrefs();
  const notif = { match: prefs.notifMatch, chat: prefs.notifChat, agree: prefs.notifAgree };
  const [dark, setDark] = useState(themeStore.mode === 'dark');

  useEffect(() => {
    let alive = true;
    settingsService.sync().then((s) => {
      if (!alive || !s) return;
      setLang(i18nStore.mode);
      setDark(themeStore.mode === 'dark');
    }).catch(() => { /* offline / unauthenticated → keep the local values */ });
    return () => { alive = false; };
  }, []);

  const changeLang = (id: Lang) => { setLang(id); settingsService.setLanguage(id); };
  const setTheme = (isDark: boolean) => { setDark(isDark); settingsService.setTheme(isDark); };
  const changeNotif = (patch: Partial<typeof notif>) => settingsService.setNotifications({ ...notif, ...patch });
  const setMarkers = (markerStyle: MarkerStyle) => prefsStore.patch({ markerStyle });

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
        <div style={{ padding: '12px 0 14px' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{t('settings.markersTitle')}</div>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>{t('settings.markersSub')}</div>
          <div role="radiogroup" aria-label={t('settings.markersTitle')} style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
            <MarkerOption active={prefs.markerStyle === 'initials'} onClick={() => setMarkers('initials')}
              label={t('settings.markersInitials')} sub={t('settings.markersInitialsSub')}
              preview={<><MarkerDot color={T.amber}>DQ</MarkerDot><MarkerDot color={T.purple}>MS</MarkerDot></>} />
            <MarkerOption active={prefs.markerStyle === 'icons'} onClick={() => setMarkers('icons')}
              label={t('settings.markersIcons')} sub={t('settings.markersIconsSub')}
              preview={<><MarkerDot color={T.amber} square>{CAR}</MarkerDot><MarkerDot color={T.purple}>{PERSON}</MarkerDot></>} />
          </div>
        </div>
      </SettSection>

      {/* Notifications */}
      <SettSection title={t('settings.notifSection')}>
        <SettToggleRow label={t('settings.notifMatch')} sub={t('settings.notifMatchSub')} value={notif.match}
          onChange={(v) => changeNotif({ match: v })} icon="🔔" color={T.teal} />
        <SettToggleRow label={t('settings.notifChat')} sub={t('settings.notifChatSub')} value={notif.chat}
          onChange={(v) => changeNotif({ chat: v })} icon="💬" color={T.amber} />
        <SettToggleRow label={t('settings.notifAgree')} sub={t('settings.notifAgreeSub')} value={notif.agree}
          onChange={(v) => changeNotif({ agree: v })} icon="🤝" color={T.green} />
        <SettToggleRow label={t('settings.quiet')} sub={t('settings.quietSub')} value={prefs.quiet}
          onChange={(v) => prefsStore.patch({ quiet: v })} icon="🔕" color={T.purple} />
      </SettSection>

      {/* People I blocked — a block is always reversible. */}
      <BlockedUsersSection />

      {/* Demo only: how many walkers the simulation puts on the map. */}
      {USE_MOCKS && (
        <SettSection title={t('settings.walkerSection')}>
          <SimCountRow />
        </SettSection>
      )}

      <div style={{ textAlign: 'center', fontSize: 11, color: T.muted, marginTop: 4 }}>
        {t('common.version')}
      </div>
    </div>
  );
}

const CAR = (
  <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6.2 10.5 7.6 6.9A2 2 0 0 1 9.5 5.6h5a2 2 0 0 1 1.9 1.3l1.4 3.6" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
    <rect x="3.5" y="10.2" width="17" height="6.3" rx="2.2" fill="#fff" />
    <circle cx="7.6" cy="16.8" r="2.1" fill="#fff" /><circle cx="16.4" cy="16.8" r="2.1" fill="#fff" />
  </svg>
);
const PERSON = (
  <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="7.2" r="3.7" fill="#fff" /><path d="M4.8 20.6c0-4.1 3.2-7 7.2-7s7.2 2.9 7.2 7z" fill="#fff" />
  </svg>
);

/** A miniature map marker for the marker-style preview. */
function MarkerDot({ color, square, children }: { color: string; square?: boolean; children: ReactNode }) {
  return (
    <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: square ? 10 : 15, background: color,
      border: '2px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,.35)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', color: '#fff', font: "700 10.5px 'DM Sans',sans-serif" }}>{children}</span>
  );
}

interface MarkerOptionProps { active: boolean; onClick: () => void; label: string; sub: string; preview: ReactNode }

/** One selectable marker style card. */
function MarkerOption({ active, onClick, label, sub, preview }: MarkerOptionProps) {
  return (
    <button role="radio" aria-checked={active} onClick={onClick} style={{ display: 'flex', flexDirection: 'column', gap: 8,
      alignItems: 'flex-start', padding: '12px', borderRadius: 13, cursor: 'pointer', textAlign: 'left',
      border: `1.5px solid ${active ? T.teal : T.border}`, background: active ? T.tealDim : T.bg,
      fontFamily: 'DM Sans,sans-serif', minHeight: 44 }}>
      <span style={{ display: 'flex', gap: 6 }}>{preview}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: active ? T.teal : T.text }}>{label}</span>
      <span style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.35 }}>{sub}</span>
    </button>
  );
}
