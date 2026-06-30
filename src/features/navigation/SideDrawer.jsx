import { T } from '@/constants/theme';
import { t } from '@/i18n';

/** Left drawer: profile, search-mode switch, settings + account panels, exit. */
export function SideDrawer({ open, onClose, mode, onModeChange, onExit, onOpenPanel }) {
  const modeOpts = [
    { id: 'passenger', label: t('home.passengerLabel'), icon: '🧑‍✈️', color: T.teal },
    { id: 'driver', label: t('home.driverLabel'), icon: '🚗', color: T.amber },
  ];
  const navItems = [
    { key: 'freemode', label: t('drawer.freeMode'), sub: t('drawer.freeModeSub'),
      color: T.teal, icon: (c) => (<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3.5 12.5l1.2-3.6A2 2 0 016.6 7.5h6.8a2 2 0 011.9 1.4l1.2 3.6" stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="6.5" cy="13.5" r="1.3" stroke={c} strokeWidth="1.5" />
        <circle cx="13.5" cy="13.5" r="1.3" stroke={c} strokeWidth="1.5" /></svg>) },
    { key: 'complaint', label: t('drawer.complaint'), sub: t('drawer.complaintSub'),
      color: T.amber, icon: (c) => (<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M4 4h12v9H8l-4 3V4z" stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M10 6.5v3M10 11.2v.1" stroke={c} strokeWidth="1.7" strokeLinecap="round" /></svg>) },
    { key: 'privacy', label: t('drawer.privacy'), sub: t('drawer.privacySub'),
      color: T.purple, icon: (c) => (<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2.5l6 2.2v4.3c0 3.6-2.5 6.6-6 8-3.5-1.4-6-4.4-6-8V4.7l6-2.2z" stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M7.6 10l1.7 1.7 3.1-3.4" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>) },
  ];

  const sectionLabel = (label) => (
    <div style={{ fontSize: 11, fontWeight: 600, color: T.muted, margin: '0 0 8px',
      textTransform: 'uppercase', letterSpacing: .8 }}>{label}</div>
  );

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 28, pointerEvents: open ? 'auto' : 'none' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)',
        opacity: open ? 1 : 0, transition: 'opacity .3s ease' }} />
      <div className="otw-drawer" style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 322,
        background: T.glassSolid, backdropFilter: 'blur(28px)',
        borderRight: `1px solid ${T.border}`, boxShadow: '8px 0 44px rgba(0,0,0,.55)',
        transform: open ? 'translateX(0)' : 'translateX(-105%)',
        transition: 'transform .34s cubic-bezier(.22,1,.36,1)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 18px 14px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 4, height: 20, borderRadius: 2, background: T.teal }} />
            <span style={{ fontSize: 16, fontWeight: 600, color: T.text }}>{t('drawer.menu')}</span>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10,
            border: `1px solid ${T.border}`, background: T.hover, color: T.muted,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke={T.muted} strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto',
          padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Profile */}
          <div style={{ background: T.surface2, borderRadius: 18, padding: '14px',
            border: `1px solid ${T.border}`, display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 50, height: 50, borderRadius: 15,
              background: `linear-gradient(135deg,${T.teal},#0e9e97)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 19, fontWeight: 700, color: 'white', flexShrink: 0 }}>AK</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{t('drawer.profileName')}</div>
              <div style={{ fontSize: 12, color: T.muted }}>{t('drawer.profileMeta')}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                <span style={{ fontSize: 11, color: T.teal }}>⭐ 4.9</span>
                <span style={{ fontSize: 11, color: T.muted }}>{t('drawer.tripsCount', { n: 312 })}</span>
              </div>
            </div>
          </div>

          {/* Search mode */}
          <div>
            {sectionLabel(t('drawer.searchMode'))}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {modeOpts.map((o) => {
                const act = mode === o.id;
                return (
                  <button key={o.id} onClick={() => onModeChange(o.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 12,
                    border: `1.5px solid ${act ? o.color + '60' : T.border}`, cursor: 'pointer',
                    background: act ? `${o.color}14` : 'transparent', fontFamily: 'DM Sans,sans-serif',
                    transition: 'all .15s ease', textAlign: 'left' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: `${o.color}20`, fontSize: 17,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{o.icon}</div>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: act ? 600 : 500, color: act ? T.text : T.muted }}>{o.label}</span>
                    <div style={{ width: 18, height: 18, borderRadius: 9, flexShrink: 0,
                      border: `2px solid ${act ? o.color : T.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {act && <div style={{ width: 8, height: 8, borderRadius: 4, background: o.color }} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Settings */}
          <div>
            {sectionLabel(t('drawer.settings'))}
            <button onClick={() => onOpenPanel('settings')} style={{ display: 'flex', alignItems: 'center', gap: 13,
              padding: '15px', borderRadius: 15, cursor: 'pointer', width: '100%', textAlign: 'left',
              border: `1.5px solid ${T.teal}40`, background: `${T.teal}12`, fontFamily: 'DM Sans,sans-serif',
              boxShadow: `0 0 0 1px ${T.teal}0d` }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: `${T.teal}22`, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="2.5" stroke={T.teal} strokeWidth="1.6" />
                  <path d="M10 3v2M10 15v2M3 10h2M15 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41" stroke={T.teal} strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{t('drawer.settings')}</div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 1 }}>{t('drawer.settingsSub')}</div>
              </div>
              <svg width="15" height="15" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                <path d="M5 3 L9 7 L5 11" stroke={T.teal} strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Account */}
          <div>
            {sectionLabel(t('drawer.account'))}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {navItems.map((it) => (
                <button key={it.key} onClick={() => onOpenPanel(it.key)} style={{ display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', borderRadius: 13, border: `1px solid ${T.border}`, cursor: 'pointer',
                  background: T.surface2, fontFamily: 'DM Sans,sans-serif', textAlign: 'left', width: '100%' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: `${it.color}18`, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{it.icon(it.color)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{it.label}</div>
                    <div style={{ fontSize: 11.5, color: T.muted }}>{it.sub}</div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M5 3 L9 7 L5 11" stroke={T.muted} strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              ))}
              <button onClick={onExit} style={{ width: '100%', padding: '12px 14px', borderRadius: 13,
                border: `1px solid ${T.red}30`, background: 'rgba(255,92,114,0.06)',
                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, background: `${T.red}18`, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M12 14l4-4-4-4" stroke={T.red} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M16 10H7M8 4H5a1 1 0 00-1 1v10a1 1 0 001 1h3" stroke={T.red} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: T.red, textAlign: 'left' }}>{t('drawer.exit')}</span>
              </button>
            </div>
          </div>

          <div style={{ textAlign: 'center', fontSize: 11, color: T.muted, marginTop: 2 }}>
            OnTheWay v1.0.0 · © 2025
          </div>
        </div>
      </div>
    </div>
  );
}
