import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { Speedometer } from './Speedometer';
import { MapStyleSwitcher } from '@/features/navigation/MapStyleSwitcher';
import { BottomNavBar } from '@/features/navigation/BottomNavBar';
import { RouteNavBar } from '@/features/route/RouteNavBar';

/** Map screen chrome: top bar, speedometer, match badge, zoom, nav bar. */
export function MapUI({ mode, mapHook, onRouteSheet, showMatching, matchCount, onMenu, mapStyleMode,
  appTheme, onMapStyleChange, routeActive, activeRoute, navProgress, onEndRoute, userLoc, onMapTask,
  navHidden, onContactCall, onContactSms, follow, onToggleFollow, engaged, onTripCreated }) {
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

      {/* Top bar */}
      <div className="otw-topbar" style={{ position: 'absolute', top: 14, left: 16, right: 16, display: 'flex', gap: 8, pointerEvents: 'auto' }}>
        <button onClick={onMenu} aria-label={t('mapui.menu')} style={{ width: 40, height: 40, borderRadius: 12,
          background: T.glass, backdropFilter: 'blur(12px)',
          border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M2 8h12M2 12h12" stroke={T.text} strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <div style={{ flex: 1, background: T.glass, backdropFilter: 'blur(12px)',
          borderRadius: 12, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 8,
          border: `1px solid ${T.border}`, height: 40 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke={T.muted} strokeWidth="1.5" />
            <path d="M9.5 9.5 L13 13" stroke={T.muted} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 13, color: T.muted }}>{t('mapui.location')}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: T.green, animation: 'pulse 1.5s ease infinite' }} />
            <span style={{ fontSize: 11, color: T.green, fontWeight: 500 }}>{t('mapui.live')}</span>
          </div>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 12,
          background: mode === 'driver' ? T.amberDim : T.tealDim,
          border: `1px solid ${mode === 'driver' ? T.amber + '40' : T.teal + '40'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
          {/* Icon = the role being searched for (matches the home screen): a driver
              looks for passengers (🧑‍✈️), a passenger looks for drivers (🚗). */}
          {mode === 'driver' ? '🧑‍✈️' : '🚗'}
        </div>
      </div>

      <Speedometer />

      {/* Matching badge */}
      {showMatching && (
        <div style={{ position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)',
          background: T.glass, backdropFilter: 'blur(12px)', borderRadius: 20,
          padding: '6px 16px', border: `1px solid ${T.tealGlow}`, pointerEvents: 'none',
          animation: 'fadeUp .4s ease both', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: T.teal, animation: 'pulse 1s ease infinite' }} />
          <span style={{ fontSize: 12, color: T.teal, fontWeight: 600 }}>
            {/* A driver discovers passengers; a passenger discovers drivers. */}
            {t(mode === 'driver' ? 'mapui.matchFoundPassengers' : 'mapui.matchFoundDrivers', { n: matchCount })}
          </span>
        </div>
      )}

      {/* Right control stack: map-style switcher + zoom, on one vertical line */}
      <div className="otw-edge" style={{ position: 'absolute', right: 16, bottom: 120, display: 'flex',
        flexDirection: 'column', alignItems: 'flex-end', gap: 8, pointerEvents: 'auto' }}>
        <MapStyleSwitcher current={mapStyleMode} onChange={onMapStyleChange} appTheme={appTheme} />
        <button onClick={onToggleFollow} title={t('mapui.follow')} aria-pressed={follow}
          style={{ width: 36, height: 36, borderRadius: 10,
            background: follow ? T.tealDim : T.glass, backdropFilter: 'blur(12px)',
            border: `1px solid ${follow ? T.teal + '60' : T.border}`, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all .15s ease', padding: 0 }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="9" r="6.2" stroke={follow ? T.teal : T.text} strokeWidth="1.4" />
            <path d="M9 3.4V1.4M9 16.6v-2M3.4 9H1.4M16.6 9h-2" stroke={follow ? T.teal : T.text} strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="9" cy="9" r="2.1" fill={follow ? T.teal : T.text} />
          </svg>
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {['+', '−'].map((s, i) => (
            <button key={i} onClick={() => (i === 0 ? mapHook.mapRef.current?.zoomIn() : mapHook.mapRef.current?.zoomOut())}
              style={{ width: 36, height: 36, borderRadius: i === 0 ? '10px 10px 4px 4px' : '4px 4px 10px 10px',
                background: T.glass, backdropFilter: 'blur(12px)',
                border: `1px solid ${T.border}`, color: T.text, fontSize: 18, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 400 }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Active route bar */}
      {activeRoute && (
        <RouteNavBar route={activeRoute} progress={navProgress} onEnd={onEndRoute} />
      )}

      {/* Bottom nav */}
      <BottomNavBar onRouteSheet={onRouteSheet} mode={mode} routeActive={routeActive}
        userLoc={userLoc} onMapTask={onMapTask} hidden={navHidden}
        onContactCall={onContactCall} onContactSms={onContactSms}
        engaged={engaged} onTripCreated={onTripCreated} />
    </div>
  );
}
