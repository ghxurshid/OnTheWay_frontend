import { T } from '@/constants/theme';
import { t } from '@/i18n';

/** Active-route progress bar (Yandex-style) with ETA + end button. */
export function RouteNavBar({ route, progress, onEnd }) {
  const pct = Math.round(progress * 100);
  const done = progress >= 1;
  // Prefer the live ETA derived from the device's real speed; fall back to the
  // route's static estimate scaled by progress when no speed is available.
  const remMin = route.liveEta ? route.liveEta.remMin : Math.max(0, Math.round(route.durationMin * (1 - progress)));
  const remKm = route.liveEta ? route.liveEta.remKm : Math.max(0, route.distanceKm * (1 - progress)).toFixed(1);
  const arrival = new Date(Date.now() + remMin * 60000)
    .toLocaleTimeString('uz', { hour: '2-digit', minute: '2-digit', hour12: false });
  return (
    <div className="otw-dockleft" style={{ position: 'absolute', left: 12, right: 12, bottom: 116, zIndex: 3, pointerEvents: 'auto',
      background: T.glass2, backdropFilter: 'blur(20px)', borderRadius: 18,
      border: `1px solid ${done ? T.green + '40' : T.teal + '30'}`,
      boxShadow: '0 8px 28px rgba(0,0,0,.5)', padding: '14px 16px',
      animation: 'fadeUp .3s ease both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 13, flexShrink: 0,
          background: done ? `${T.green}22` : T.tealDim,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {done ? (
            <span style={{ fontSize: 20 }}>🎉</span>
          ) : (
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
              <path d="M11 2 L19 20 L11 15 L3 20 Z" fill={T.teal} />
            </svg>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {done ? (
            <div style={{ fontSize: 15, fontWeight: 700, color: T.green }}>{t('nav2.arrived')}</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{remMin} min</span>
              <span style={{ fontSize: 13, color: T.muted }}>{t('nav2.remaining', { km: remKm })}</span>
            </div>
          )}
          <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>
            {done ? t('nav2.finished') : t('nav2.eta', { time: arrival })}
          </div>
        </div>
        <button onClick={onEnd} title={t('nav2.endTip')}
          style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0,
            border: `1px solid ${T.red}40`, background: 'rgba(255,92,114,0.1)',
            color: T.red, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div style={{ marginTop: 12, height: 6, borderRadius: 3, background: T.bg, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3,
          background: done ? T.green : `linear-gradient(to right,${T.teal},#0e9e97)`,
          transition: 'width .45s linear' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
        <span style={{ fontSize: 10, color: done ? T.green : T.teal, fontWeight: 600 }}>{pct}%</span>
        <span style={{ fontSize: 10, color: T.muted }}>
          {route.distanceKm.toFixed(1)} km · {Math.round(route.durationMin)} min
        </span>
      </div>
    </div>
  );
}
