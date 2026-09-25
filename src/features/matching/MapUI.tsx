import { useState } from 'react';
import type { ReactNode } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { Speedometer } from './Speedometer';
import { MapStyleSwitcher } from '@/features/navigation/MapStyleSwitcher';
import { BottomNavBar } from '@/features/navigation/BottomNavBar';
import { RouteNavBar } from '@/features/route/RouteNavBar';
import type { ChatPeer } from '@/features/contacts/ChatsPanel';
import type { HubStatus } from '@/services/realtime/hubConnection';
import type { ActiveRoute, Contact, LatLng, MapTask, PartyType } from '@/models';
import type { MapHook } from '@/hooks/mapHook';

/** Why the user is (not) discoverable right now. */
export type Visibility = 'visible' | 'hidden-driver' | 'hidden-passenger' | 'busy';

interface MapUIProps {
  mode: PartyType;
  mapHook: MapHook;
  onRouteSheet: () => void;
  onMenu: () => void;
  mapStyleMode: string;
  appTheme: string;
  onMapStyleChange: (id: string) => void;
  routeActive: boolean;
  activeRoute: ActiveRoute | null;
  navProgress: number;
  onEndRoute: () => void;
  gpsIssue: boolean;
  userLoc: LatLng | null;
  onMapTask: (task: MapTask) => void;
  navHidden: boolean;
  onContactCall: (c: Contact) => void;
  onContactSms: (c: Contact) => void;
  onOpenChat: (peer: ChatPeer) => void;
  onOpenMyTrips: () => void;
  follow: boolean;
  onToggleFollow: () => void;
  engaged: boolean;
  onTripCreated: (tripId: unknown) => void;
  /** Place name of the user's area (reverse geocoded), null while unknown. */
  areaName: string | null;
  /** The device location could not be read. */
  locationOff: boolean;
  onRetryLocation: () => void;
  realtime: HubStatus;
  visibility: Visibility;
  /** Opposite-role walkers on the map (null until the first load). */
  walkerCount: number | null;
}

/** A compact notice on the map, optionally actionable. */
function Chip({ tone, children, action }: { tone: string; children: ReactNode; action?: { label: string; onClick: () => void } }) {
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px 8px 12px',
      background: T.glass2, backdropFilter: 'blur(14px)', borderRadius: 12, border: `1px solid ${tone}55`,
      boxShadow: '0 4px 14px rgba(0,0,0,.3)', pointerEvents: 'auto', maxWidth: '100%' }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 4, background: tone, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 12, color: T.text, lineHeight: 1.35 }}>{children}</span>
      {action && (
        <button onClick={action.onClick} style={{ flexShrink: 0, padding: '5px 10px', borderRadius: 8, border: 'none',
          background: tone, color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'DM Sans,sans-serif' }}>{action.label}</button>
      )}
    </div>
  );
}

/** Map screen chrome: status bar, notices, map controls, route bar and nav bar.
 *  New matches are announced as queued toasts (see useToastQueue + PushToast). */
export function MapUI({ mode, mapHook, onRouteSheet, onMenu, mapStyleMode,
  appTheme, onMapStyleChange, routeActive, activeRoute, navProgress, onEndRoute, gpsIssue, userLoc, onMapTask,
  navHidden, onContactCall, onContactSms, onOpenChat, onOpenMyTrips, follow, onToggleFollow, engaged, onTripCreated,
  areaName, locationOff, onRetryLocation, realtime, visibility, walkerCount }: MapUIProps) {
  const [panelOpen, setPanelOpen] = useState(false);

  const live = realtime === 'connected';
  const statusTone = live ? T.green : realtime === 'reconnecting' || realtime === 'connecting' ? T.amber : T.red;
  const statusLabel = live ? t('mapui.live') : realtime === 'disconnected' ? t('mapui.offline') : t('mapui.reconnecting');
  const place = locationOff ? t('mapui.locationOffTitle') : (areaName || t('mapui.locating'));

  // One notice at a time, most important first.
  let notice: ReactNode = null;
  if (realtime === 'disconnected') {
    notice = <Chip tone={T.red}>{t('mapui.offlineBanner')}</Chip>;
  } else if (locationOff) {
    notice = <Chip tone={T.amber} action={{ label: t('mapui.locationRetry'), onClick: onRetryLocation }}>{t('mapui.locationOffBody')}</Chip>;
  } else if (visibility === 'hidden-driver') {
    notice = <Chip tone={T.amber} action={{ label: t('drawer.freeMode'), onClick: onMenu }}>{t('mapui.invisibleDriver')}</Chip>;
  } else if (visibility === 'hidden-passenger' && !routeActive) {
    notice = <Chip tone={T.amber} action={{ label: t('nav.new'), onClick: onRouteSheet }}>{t('mapui.invisiblePassenger')}</Chip>;
  } else if (visibility === 'busy') {
    notice = <Chip tone={T.red} action={{ label: t('drawer.menu'), onClick: onMenu }}>{t('drawer.busyOn')}</Chip>;
  } else if (walkerCount === 0) {
    notice = <Chip tone={T.teal}>{mode === 'driver' ? t('mapui.nobodyPassengers') : t('mapui.nobodyDrivers')} · {t('mapui.nobodyHint')}</Chip>;
  }

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>
      {/* Top gradient */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 90,
        background: `linear-gradient(to bottom,rgba(${T.scrimRgb},.85) 0%,transparent 100%)`,
        pointerEvents: 'none' }} />
      {/* Bottom gradient */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 180,
        background: `linear-gradient(to top,rgba(${T.scrimRgb},.9) 0%,transparent 100%)`,
        pointerEvents: 'none' }} />

      {/* Top bar: menu · where you are + connection · role */}
      <div className="otw-topbar" style={{ position: 'absolute', top: 14, left: 16, right: 16, display: 'flex', gap: 8, pointerEvents: 'auto' }}>
        <button onClick={onMenu} aria-label={t('mapui.menu')} style={{ width: 40, height: 40, borderRadius: 12,
          background: T.glass, backdropFilter: 'blur(12px)',
          border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M2 4h12M2 8h12M2 12h12" stroke={T.text} strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <div role="status" style={{ flex: 1, minWidth: 0, background: T.glass, backdropFilter: 'blur(12px)',
          borderRadius: 12, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 8,
          border: `1px solid ${T.border}`, height: 40 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M7 1.3C4.9 1.3 3.2 3 3.2 5.1c0 2.6 3.8 6 3.8 6s3.8-3.4 3.8-6C10.8 3 9.1 1.3 7 1.3z" stroke={T.muted} strokeWidth="1.3" />
            <circle cx="7" cy="5.1" r="1.3" fill={T.muted} />
          </svg>
          <span style={{ fontSize: 13, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{place}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
            <div aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 3, background: statusTone,
              animation: live ? 'pulse 1.5s ease infinite' : 'none' }} />
            <span style={{ fontSize: 11, color: statusTone, fontWeight: 500 }}>{statusLabel}</span>
          </div>
        </div>
        <div aria-label={mode === 'driver' ? t('home.driverLabel') : t('home.passengerLabel')}
          style={{ width: 40, height: 40, borderRadius: 12,
            background: mode === 'driver' ? T.amberDim : T.tealDim,
            border: `1px solid ${mode === 'driver' ? T.amber + '40' : T.teal + '40'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
          {/* Icon = the role being searched for (matches the home screen): a driver
              looks for passengers (🧑‍✈️), a passenger looks for drivers (🚗). */}
          <span aria-hidden="true">{mode === 'driver' ? '🧑‍✈️' : '🚗'}</span>
        </div>
      </div>

      <Speedometer />

      {/* Notices sit under the speedometer, clear of the right-hand controls. */}
      {notice && !panelOpen && !navHidden && (
        <div style={{ position: 'absolute', top: 122, left: 16, right: 64, display: 'flex' }}>{notice}</div>
      )}

      {/* Top-right control stack: basemap switcher + follow + zoom. Hidden while a
          bottom panel is open so it never covers the panel's tabs and fields. */}
      {!panelOpen && (
        <div className="otw-edge otw-edge-top" style={{ position: 'absolute', right: 16, top: 88, zIndex: 12,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, pointerEvents: 'auto' }}>
          <MapStyleSwitcher current={mapStyleMode} onChange={onMapStyleChange} appTheme={appTheme} placement="down" />
          <button onClick={onToggleFollow} title={t('mapui.follow')} aria-label={t('mapui.follow')} aria-pressed={follow}
            style={{ width: 36, height: 36, borderRadius: 10,
              background: follow ? T.tealDim : T.glass, backdropFilter: 'blur(12px)',
              border: `1px solid ${follow ? T.teal + '60' : T.border}`, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all .15s ease', padding: 0 }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="6.2" stroke={follow ? T.teal : T.text} strokeWidth="1.4" />
              <path d="M9 3.4V1.4M9 16.6v-2M3.4 9H1.4M16.6 9h-2" stroke={follow ? T.teal : T.text} strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="9" cy="9" r="2.1" fill={follow ? T.teal : T.text} />
            </svg>
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {(['+', '−'] as const).map((s, i) => (
              <button key={s} aria-label={i === 0 ? t('mapui.zoomIn') : t('mapui.zoomOut')}
                onClick={() => (i === 0 ? mapHook.mapRef.current?.zoomIn() : mapHook.mapRef.current?.zoomOut())}
                style={{ width: 36, height: 36, borderRadius: i === 0 ? '10px 10px 4px 4px' : '4px 4px 10px 10px',
                  background: T.glass, backdropFilter: 'blur(12px)',
                  border: `1px solid ${T.border}`, color: T.text, fontSize: 18, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 400 }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active route bar */}
      {activeRoute && !panelOpen && (
        <RouteNavBar route={activeRoute} progress={navProgress} onEnd={onEndRoute} gpsIssue={gpsIssue} />
      )}

      {/* Bottom nav */}
      <BottomNavBar onRouteSheet={onRouteSheet} mode={mode} routeActive={routeActive}
        userLoc={userLoc} onMapTask={onMapTask} hidden={navHidden}
        onContactCall={onContactCall} onContactSms={onContactSms}
        onOpenChat={onOpenChat} onOpenMyTrips={onOpenMyTrips} onPanelChange={setPanelOpen}
        engaged={engaged} onTripCreated={onTripCreated} />
    </div>
  );
}
