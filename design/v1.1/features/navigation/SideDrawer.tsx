import type { ReactNode } from 'react';
import { T, TEAL_GRADIENT } from '@/constants/theme';
import { t } from '@/i18n';
import { useBackHandler } from '@/hooks/useBackHandler';
import { usePrefs } from '@/hooks/usePrefs';
import { useProfileIdentity } from '@/features/settings/ProfileScreen';
import { RoleGlyph } from '@/components/ui/MapSheet';
import { vehicleLine } from '@/services/prefsStore';
import { initialsOf } from '@/utils/avatar';
import type { PartyType } from '@/models';

interface SideDrawerProps {
  open: boolean;
  onClose: () => void;
  mode: PartyType;
  onExit: () => void;
  onOpenPanel: (key: string) => void;
}

/** Left drawer: who I am (Telegram photo, name, role, car) → profile; then
 *  settings, support and privacy, and switching role. Visibility switches live
 *  in the map's top bar ("Who can see you?"), trips in the bottom bar. */
export function SideDrawer({ open, onClose, mode, onExit, onOpenPanel }: SideDrawerProps) {
  useBackHandler(onClose, open);
  const { name, photo } = useProfileIdentity();
  const prefs = usePrefs();
  const car = vehicleLine(prefs.vehicle);
  const navItems = [
    { key: 'settings', label: t('drawer.settings'), sub: t('drawer.settingsSub'),
      color: T.teal, icon: (c: string) => (<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="2.5" stroke={c} strokeWidth="1.6" />
        <path d="M10 3v2M10 15v2M3 10h2M15 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41" stroke={c} strokeWidth="1.6" strokeLinecap="round" /></svg>) },
    { key: 'complaint', label: t('drawer.complaint'), sub: t('drawer.complaintSub'),
      color: T.amber, icon: (c: string) => (<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M4 4h12v9H8l-4 3V4z" stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M10 6.5v3M10 11.2v.1" stroke={c} strokeWidth="1.7" strokeLinecap="round" /></svg>) },
    { key: 'privacy', label: t('drawer.privacy'), sub: t('drawer.privacySub'),
      color: T.purple, icon: (c: string) => (<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2.5l6 2.2v4.3c0 3.6-2.5 6.6-6 8-3.5-1.4-6-4.4-6-8V4.7l6-2.2z" stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M7.6 10l1.7 1.7 3.1-3.4" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>) },
  ];

  const sectionLabel = (label: ReactNode) => (
    <div style={{ fontSize: 11.5, fontWeight: 600, color: T.muted, margin: '0 0 8px',
      textTransform: 'uppercase', letterSpacing: .8 }}>{label}</div>
  );

  return (
    <div inert={(!open ? '' : undefined) as unknown as boolean} aria-hidden={!open} role="dialog" aria-modal={open} aria-label={t('drawer.menu')}
      style={{ position: 'absolute', inset: 0, zIndex: 28, pointerEvents: open ? 'auto' : 'none' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)',
        opacity: open ? 1 : 0, transition: 'opacity .3s ease' }} />
      <div className="otw-drawer" style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 322,
        background: T.glassSolid, backdropFilter: 'blur(28px)',
        borderRight: `1px solid ${T.border}`, boxShadow: '8px 0 44px rgba(0,0,0,.55)',
        transform: open ? 'translateX(0)' : 'translateX(-105%)',
        transition: 'transform .34s cubic-bezier(.22,1,.36,1)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 18px 12px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 4, height: 20, borderRadius: 2, background: T.teal }} />
            <span style={{ fontSize: 16, fontWeight: 600, color: T.text }}>{t('drawer.menu')}</span>
          </div>
          <button onClick={onClose} aria-label={t('drawer.close')} style={{ width: 44, height: 44, borderRadius: 12,
            border: `1px solid ${T.border}`, background: T.hover, color: T.muted,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke={T.muted} strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto',
          padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Profile → edit */}
          <button onClick={() => onOpenPanel('profile')} style={{ background: T.surface2, borderRadius: 18, padding: '14px',
            border: `1px solid ${T.border}`, display: 'flex', gap: 14, alignItems: 'center', cursor: 'pointer', textAlign: 'left',
            fontFamily: 'DM Sans,sans-serif', width: '100%' }}>
            <div style={{ width: 54, height: 54, borderRadius: 16, overflow: 'hidden', background: TEAL_GRADIENT,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 19, fontWeight: 700, color: 'white', flexShrink: 0 }}>
              {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initialsOf(name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
              <div style={{ fontSize: 12.5, color: mode === 'driver' ? T.amber : T.teal, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <RoleGlyph type={mode} size={14} color={mode === 'driver' ? T.amber : T.teal} />
                {mode === 'driver' ? t('common.driver') : t('common.passenger')}
              </div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {car || t('profile.addCar')}
              </div>
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: T.teal, flexShrink: 0 }}>{t('profile.edit')}</span>
          </button>

          <div>
            {sectionLabel(t('drawer.account'))}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {navItems.map((it) => (
                <button key={it.key} onClick={() => onOpenPanel(it.key)} style={{ display: 'flex', alignItems: 'center', gap: 12,
                  minHeight: 60, padding: '10px 14px', borderRadius: 13, border: `1px solid ${T.border}`, cursor: 'pointer',
                  background: T.surface2, fontFamily: 'DM Sans,sans-serif', textAlign: 'left', width: '100%' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: `${it.color}18`, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{it.icon(it.color)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600, color: T.text }}>{it.label}</div>
                    <div style={{ fontSize: 12, color: T.muted }}>{it.sub}</div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M5 3 L9 7 L5 11" stroke={T.muted} strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              ))}
              <button onClick={onExit} style={{ width: '100%', minHeight: 56, padding: '10px 14px', borderRadius: 13,
                border: `1px solid ${T.border}`, background: T.surface2,
                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, background: mode === 'driver' ? T.tealDim : T.amberDim, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <RoleGlyph type={mode === 'driver' ? 'passenger' : 'driver'} size={19} color={mode === 'driver' ? T.teal : T.amber} />
                </div>
                <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600, color: T.text, textAlign: 'left' }}>
                  {t('role.switchTo', { role: mode === 'driver' ? t('common.passenger') : t('common.driver') })}
                </span>
              </button>
            </div>
          </div>

          <div style={{ textAlign: 'center', fontSize: 11.5, color: T.muted, marginTop: 2 }}>
            {t('common.version')}
          </div>
        </div>
      </div>
    </div>
  );
}
