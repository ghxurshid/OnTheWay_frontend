import { useState } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { fmt12 } from '@/utils/datetime';
import type { ActiveRoute } from '@/models';

interface RouteNavBarProps {
  route: ActiveRoute;
  progress: number;
  onEnd: () => void;
  /** Real GPS is unavailable/denied: explain why progress is not moving. */
  gpsIssue?: boolean;
}

/** Active-route progress bar (Yandex-style) with ETA. Ending the trip is an
    explicit, confirmed action — it completes the trip and stops live sharing. */
export function RouteNavBar({ route, progress, onEnd, gpsIssue = false }: RouteNavBarProps) {
  const [confirming, setConfirming] = useState(false);
  const pct = Math.round(progress * 100);
  const done = progress >= 1;
  // Prefer the live ETA derived from the device's real speed; fall back to the
  // route's static estimate scaled by progress when no speed is available.
  const remMin = route.liveEta ? route.liveEta.remMin : Math.max(0, Math.round(route.durationMin * (1 - progress)));
  const remKm = route.liveEta ? route.liveEta.remKm : Math.max(0, route.distanceKm * (1 - progress)).toFixed(1);
  const arrival = fmt12(new Date(Date.now() + remMin * 60000));

  return (
    <div className="otw-dockleft" role="region" aria-label={t('nav2.endTip')} style={{ position: 'absolute', left: 12, right: 12, bottom: 116, zIndex: 3, pointerEvents: 'auto',
      background: T.glass2, backdropFilter: 'blur(20px)', borderRadius: 18,
      border: `1px solid ${done ? T.green + '40' : T.teal + '30'}`,
      boxShadow: '0 8px 28px rgba(0,0,0,.5)', padding: '14px 16px',
      animation: 'fadeUp .3s ease both' }}>
      {confirming ? (
        <div role="alertdialog" aria-labelledby="end-trip-title" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div id="end-trip-title" style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{t('nav2.endConfirmTitle')}</div>
          <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.45 }}>{t('nav2.endConfirmBody')}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setConfirming(false)} style={{ flex: 1, padding: '11px', borderRadius: 12,
              border: `1px solid ${T.border}`, background: 'transparent', color: T.text, fontSize: 13.5, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{t('nav2.keepBtn')}</button>
            <button onClick={() => { setConfirming(false); onEnd(); }} autoFocus style={{ flex: 1, padding: '11px', borderRadius: 12,
              border: 'none', background: T.red, color: '#fff', fontSize: 13.5, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{t('nav2.endBtn')}</button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div aria-hidden="true" style={{ width: 42, height: 42, borderRadius: 13, flexShrink: 0,
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
                  <span style={{ fontSize: 20, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{t('common.minutes', { n: remMin })}</span>
                  <span style={{ fontSize: 13, color: T.muted }}>{t('nav2.remaining', { km: remKm })}</span>
                </div>
              )}
              <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>
                {done ? t('nav2.finished') : t('nav2.eta', { time: arrival })}
              </div>
            </div>
            <button onClick={() => setConfirming(true)}
              style={{ height: 38, padding: '0 14px', borderRadius: 12, flexShrink: 0,
                border: done ? 'none' : `1px solid ${T.red}40`, background: done ? T.green : 'rgba(255,92,114,0.1)',
                color: done ? '#fff' : T.red, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                fontFamily: 'DM Sans,sans-serif' }}>
              {t('nav2.endBtn')}
            </button>
          </div>
          {gpsIssue && !done && (
            <div role="status" style={{ marginTop: 10, fontSize: 12, color: T.amber, lineHeight: 1.4 }}>📡 {t('nav2.gpsWaiting')}</div>
          )}
          <div style={{ marginTop: 12, height: 6, borderRadius: 3, background: T.bg, overflow: 'hidden' }}
            role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3,
              background: done ? T.green : `linear-gradient(to right,${T.teal},#0e9e97)`,
              transition: 'width .45s linear' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
            <span style={{ fontSize: 10, color: done ? T.green : T.teal, fontWeight: 600 }}>{pct}%</span>
            <span style={{ fontSize: 10, color: T.muted }}>
              {t('common.km', { n: route.distanceKm.toFixed(1) })} · {t('common.minutes', { n: Math.round(route.durationMin) })}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
