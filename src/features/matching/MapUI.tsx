import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { Speedometer } from './Speedometer';
import { VisibilitySheet } from './VisibilitySheet';
import { visibilityLook } from './format';
import { MapListSheet } from './MapListSheet';
import type { MapPerson } from './types';
import { RoleGlyph } from '@/components/ui/MapSheet';
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
  /** Switch passenger ⇄ driver without leaving the map. */
  onSwitchRole: () => void;
  freeMode: boolean;
  banded: boolean;
  canBand: boolean;
  onToggleFreeMode: () => void;
  onToggleBanded: () => void;
  /** The people currently on the map (for the list view). */
  listPeople: () => MapPerson[];
  onOpenPerson: (id: string) => void;
  /** A driver who has not described their car yet. */
  needsVehicle: boolean;
  onOpenProfile: () => void;
  onShareTrip: () => void;
  /** "Tell me when someone appears" is on. */
  notifyMeOn: boolean;
  onNotifyMe: () => void;
  /** The ride-together card (rendered by App), docked above the nav bar. */
  agreementSlot?: ReactNode;
  /** A bottom panel or sheet is open (App holds toasts back meanwhile). */
  onPanelChange?: (open: boolean) => void;
  onTripsChanged?: (openCount: number) => void;
  /** A push toast is on screen — it owns the top band, so the notice steps aside. */
  toastOn?: boolean;
}

/** Heights of the right-hand control stack: full · without zoom · basemap + follow only. */
const CTRL_FULL = 246;
const CTRL_NO_ZOOM = 148;

interface ChipAction { label: string; onClick: () => void }

/** A compact notice on the map, optionally actionable. */
function Chip({ tone, children, actions = [] }: { tone: string; children: ReactNode; actions?: ChipAction[] }) {
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '8px 8px 8px 12px',
      background: T.glass2, backdropFilter: 'blur(14px)', borderRadius: 14, border: `1px solid ${tone}55`,
      boxShadow: '0 4px 14px rgba(0,0,0,.3)', pointerEvents: 'auto', maxWidth: '100%' }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: tone, flexShrink: 0 }} />
      <span style={{ flex: '1 1 160px', fontSize: 13, color: T.text, lineHeight: 1.4 }}>{children}</span>
      {actions.map((a) => (
        <button key={a.label} onClick={a.onClick} style={{ flexShrink: 0, minHeight: 36, padding: '0 12px', borderRadius: 10, border: 'none',
          background: tone, color: tone === T.amber || tone === T.teal ? '#1a1205' : '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'DM Sans,sans-serif' }}>{a.label}</button>
      ))}
    </div>
  );
}

const ctrlBtn = (active = false): CSSProperties => ({
  width: 44, height: 44, borderRadius: 12, background: active ? T.tealDim : T.glass, backdropFilter: 'blur(12px)',
  border: `1px solid ${active ? T.teal + '60' : T.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center',
  justifyContent: 'center', transition: 'all .15s ease', padding: 0, color: T.text, position: 'relative',
});

/** Map screen chrome: top bar (place · visibility · nearby count · role), notices,
 *  map controls, the docked agreement/route cards and the bottom nav bar. */
export function MapUI({ mode, mapHook, onRouteSheet, onMenu, mapStyleMode,
  appTheme, onMapStyleChange, routeActive, activeRoute, navProgress, onEndRoute, gpsIssue, userLoc, onMapTask,
  navHidden, onContactCall, onContactSms, onOpenChat, follow, onToggleFollow, engaged, onTripCreated,
  areaName, locationOff, onRetryLocation, realtime, visibility, walkerCount, onSwitchRole, freeMode, banded, canBand,
  onToggleFreeMode, onToggleBanded, listPeople, onOpenPerson, needsVehicle, onOpenProfile, onShareTrip,
  notifyMeOn, onNotifyMe, agreementSlot, onPanelChange, onTripsChanged, toastOn = false }: MapUIProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [sheet, setSheet] = useState<'status' | 'list' | null>(null);
  const [panelReq, setPanelReq] = useState<{ id: string; n: number } | null>(null);
  const openSearch = () => setPanelReq((r) => ({ id: 'search', n: (r?.n || 0) + 1 }));
  const changePanel = (open: boolean) => { setPanelOpen(open); onPanelChange?.(open || !!sheet); };
  const openSheet = (s: 'status' | 'list' | null) => { setSheet(s); onPanelChange?.(panelOpen || !!s); };

  const live = realtime === 'connected';
  const connTone = realtime === 'reconnecting' || realtime === 'connecting' ? T.amber : T.red;
  const connLabel = realtime === 'disconnected' ? t('mapui.offline') : t('mapui.reconnecting');
  const place = locationOff ? t('mapui.locationOffTitle') : (areaName || t('mapui.locating'));
  const vis = visibilityLook(visibility);
  const nearby = walkerCount != null && walkerCount > 0
    ? (mode === 'driver' ? t('status.nearbyPassengers', { n: walkerCount }) : t('status.nearbyDrivers', { n: walkerCount }))
    : null;
  const showSpeed = mode === 'driver' && routeActive;

  // Short screens (landscape, 568–667px phones) and tall docked cards leave less
  // room than the control stack needs; drop zoom first (pinch still works), then
  // the list button, so the stack never runs under the dock or the nav bar.
  const rootRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const [ctrlRoom, setCtrlRoom] = useState(CTRL_FULL);
  const [dockHigh, setDockHigh] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const r = root.getBoundingClientRect();
      const edge = root.querySelector('.otw-edge-top');
      const top = edge ? edge.getBoundingClientRect().top : r.top + 96;
      let limit = r.bottom;
      const d = dockRef.current?.getBoundingClientRect();
      if (d && d.height > 0) limit = Math.min(limit, d.top);
      // A tall docked card reaching the notice row wins; the notice waits.
      setDockHigh(!!d && d.height > 0 && d.top - r.top < 190);
      const n = root.querySelector('.otw-navbar')?.getBoundingClientRect();
      if (n && n.height > 0) limit = Math.min(limit, n.top);
      setCtrlRoom(Math.floor(limit - top - 8));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    if (dockRef.current) ro.observe(dockRef.current);
    measure();
    return () => ro.disconnect();
  }, [panelOpen, sheet, navHidden]);
  const showZoom = ctrlRoom >= CTRL_FULL;
  const showList = ctrlRoom >= CTRL_NO_ZOOM;

  // One notice at a time, most important first. "Notify me" does not need the
  // user to be visible, so an empty map offers it in the hidden notices too.
  const emptyMap = walkerCount === 0;
  const notifyAction = emptyMap && !notifyMeOn ? [{ label: t('mapx.notifyMe'), onClick: onNotifyMe }] : [];
  const notifyNote = emptyMap && notifyMeOn ? ` · ${t('mapx.notifyOn')}` : '';
  let notice: ReactNode = null;
  if (realtime === 'disconnected') {
    notice = <Chip tone={T.red}>{t('mapui.offlineBanner')}</Chip>;
  } else if (locationOff) {
    notice = <Chip tone={T.amber} actions={[{ label: t('mapui.locationRetry'), onClick: onRetryLocation }]}>{t('mapui.locationOffBody')}</Chip>;
  } else if (visibility === 'hidden-driver' && !routeActive) {
    notice = <Chip tone={T.amber} actions={[{ label: t('drawer.freeMode'), onClick: onToggleFreeMode }, { label: t('status.addRoute'), onClick: onRouteSheet },
      ...notifyAction]}>{t('mapui.invisibleDriver')}{notifyNote}</Chip>;
  } else if (visibility === 'hidden-passenger' && !routeActive) {
    notice = <Chip tone={T.amber} actions={[{ label: t('status.addRoute'), onClick: onRouteSheet }, ...notifyAction]}>{t('mapui.invisiblePassenger')}{notifyNote}</Chip>;
  } else if (walkerCount === 0) {
    notice = (
      <Chip tone={T.teal} actions={[{ label: t('mapx.seeBoard'), onClick: openSearch },
        ...(notifyMeOn ? [] : [{ label: t('mapx.notifyMe'), onClick: onNotifyMe }])]}>
        {mode === 'driver' ? t('mapui.nobodyPassengers') : t('mapui.nobodyDrivers')}{notifyMeOn ? ` · ${t('mapx.notifyOn')}` : ''}
      </Chip>
    );
  } else if (needsVehicle) {
    notice = <Chip tone={T.teal} actions={[{ label: t('mapx.addVehicleBtn'), onClick: onOpenProfile }]}>{t('mapx.addVehicle')}</Chip>;
  }

  return (
    <div ref={rootRef} style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 100,
        background: `linear-gradient(to bottom,rgba(${T.scrimRgb},.85) 0%,transparent 100%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 180,
        background: `linear-gradient(to top,rgba(${T.scrimRgb},.9) 0%,transparent 100%)`, pointerEvents: 'none' }} />

      {/* Top bar: menu · place + visibility + nearby · role switch */}
      <div className="otw-topbar" style={{ position: 'absolute', top: 14, left: 16, right: 16, display: 'flex', gap: 8, pointerEvents: 'auto' }}>
        <button onClick={onMenu} aria-label={t('mapui.menu')} style={{ ...ctrlBtn(), height: 48, width: 48, borderRadius: 14 }}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M2 4h12M2 8h12M2 12h12" stroke={T.text} strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <button onClick={() => openSheet('status')} aria-label={t('status.open')} style={{ flex: 1, minWidth: 0, height: 48,
          background: T.glass, backdropFilter: 'blur(12px)', borderRadius: 14, padding: '0 14px', border: `1px solid ${T.border}`,
          display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, cursor: 'pointer', textAlign: 'left',
          fontFamily: 'DM Sans,sans-serif' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{place}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.muted, whiteSpace: 'nowrap', overflow: 'hidden', width: '100%' }}>
            {live ? (
              <>
                <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 4, background: vis.tone, flexShrink: 0,
                  animation: visibility === 'visible' ? 'pulse 1.6s ease infinite' : 'none' }} />
                <span style={{ color: vis.tone === T.muted ? T.text : vis.tone, fontWeight: 600 }}>{vis.label}</span>
                {nearby && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>· {nearby}</span>}
              </>
            ) : (
              <>
                <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 4, background: connTone, flexShrink: 0 }} />
                <span style={{ color: connTone, fontWeight: 600 }}>{connLabel}</span>
              </>
            )}
          </span>
        </button>
        <button onClick={onSwitchRole}
          aria-label={t('role.switchTo', { role: mode === 'driver' ? t('common.passenger') : t('common.driver') })}
          title={t('role.switchTo', { role: mode === 'driver' ? t('common.passenger') : t('common.driver') })}
          style={{ ...ctrlBtn(), height: 48, width: 56, borderRadius: 14, gap: 3,
            background: mode === 'driver' ? T.amberDim : T.tealDim,
            border: `1px solid ${mode === 'driver' ? T.amber + '50' : T.teal + '50'}` }}>
          <RoleGlyph type={mode} size={20} color={mode === 'driver' ? T.amber : T.teal} />
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M2 3.5h6l-1.6-1.6M8 6.5H2l1.6 1.6" stroke={T.muted} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {showSpeed && <Speedometer />}

      {notice && !panelOpen && !navHidden && !sheet && !toastOn && !dockHigh && (
        <div className={`otw-notice${showSpeed ? ' otw-notice-low' : ''}`} style={{ position: 'absolute', top: showSpeed ? 128 : 72, left: 16, right: 72, display: 'flex' }}>{notice}</div>
      )}

      {/* Top-right controls: basemap · follow · list · zoom. Hidden while a
          bottom panel is open so they never cover its tabs and fields. */}
      {!panelOpen && !sheet && (
        <div className="otw-edge otw-edge-top" style={{ position: 'absolute', right: 16, top: 96, zIndex: 12,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, pointerEvents: 'auto' }}>
          <MapStyleSwitcher current={mapStyleMode} onChange={onMapStyleChange} appTheme={appTheme} placement="down" />
          <button onClick={onToggleFollow} title={t('mapui.follow')} aria-label={t('mapui.follow')} aria-pressed={follow} style={ctrlBtn(follow)}>
            <svg width="20" height="20" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="6.2" stroke={follow ? T.teal : T.text} strokeWidth="1.4" />
              <path d="M9 3.4V1.4M9 16.6v-2M3.4 9H1.4M16.6 9h-2" stroke={follow ? T.teal : T.text} strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="9" cy="9" r="2.1" fill={follow ? T.teal : T.text} />
            </svg>
          </button>
          {showList && <button onClick={() => openSheet('list')} title={t('mapx.list')} aria-label={t('mapx.list')} style={ctrlBtn()}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M7 5h10M7 10h10M7 15h10" stroke={T.text} strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="3.5" cy="5" r="1.2" fill={T.text} /><circle cx="3.5" cy="10" r="1.2" fill={T.text} /><circle cx="3.5" cy="15" r="1.2" fill={T.text} />
            </svg>
            {walkerCount != null && walkerCount > 0 && (
              <span aria-hidden="true" style={{ position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9,
                padding: '0 4px', background: T.teal, color: '#04201e', fontSize: 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{walkerCount}</span>
            )}
          </button>}
          {showZoom && <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {(['+', '−'] as const).map((s, i) => (
              <button key={s} aria-label={i === 0 ? t('mapui.zoomIn') : t('mapui.zoomOut')}
                onClick={() => (i === 0 ? mapHook.mapRef.current?.zoomIn() : mapHook.mapRef.current?.zoomOut())}
                style={{ ...ctrlBtn(), borderRadius: i === 0 ? '12px 12px 4px 4px' : '4px 4px 12px 12px', fontSize: 20 }}>
                {s}
              </button>
            ))}
          </div>}
        </div>
      )}

      {/* Docked cards: the agreed ride and the active route, stacked. */}
      {!panelOpen && (agreementSlot || activeRoute) && (
        <div ref={dockRef} className="otw-dock" style={{ position: 'absolute', left: 12, right: 12, bottom: 116, zIndex: 3,
          display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
          {agreementSlot}
          {activeRoute && <RouteNavBar route={activeRoute} progress={navProgress} onEnd={onEndRoute} gpsIssue={gpsIssue} onShare={onShareTrip} />}
        </div>
      )}

      <BottomNavBar onRouteSheet={onRouteSheet} mode={mode} routeActive={routeActive}
        userLoc={userLoc} onMapTask={onMapTask} hidden={navHidden}
        onContactCall={onContactCall} onContactSms={onContactSms}
        onOpenChat={onOpenChat} onPanelChange={changePanel}
        engaged={engaged} onTripCreated={onTripCreated} request={panelReq} onTripsChanged={onTripsChanged} />

      {sheet === 'status' && (
        <VisibilitySheet mode={mode} visibility={visibility} freeMode={freeMode} routeActive={routeActive}
          banded={banded} canBand={canBand} onToggleFreeMode={onToggleFreeMode} onToggleBanded={onToggleBanded}
          onAddRoute={onRouteSheet} onClose={() => openSheet(null)} />
      )}
      {sheet === 'list' && (
        <MapListSheet mode={mode} read={listPeople} onOpen={onOpenPerson} onSeeBoard={openSearch} onClose={() => openSheet(null)} />
      )}
    </div>
  );
}
