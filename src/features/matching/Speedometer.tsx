import { useState, useEffect, useRef, memo } from 'react';
import { t } from '@/i18n';

/** Live speedometer driven by the device's GPS speed (top-left HUD).
 *  Propless and self-contained — memo'd so parent (MapUI) re-renders during
 *  navigation don't needlessly re-render it. */
export const Speedometer = memo(function Speedometer() {
  const [cur, setCur] = useState(0);
  const smooth = useRef(0);

  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        // coords.speed is metres/second (or null when unknown / stationary).
        const mps = p.coords.speed;
        const kmh = mps != null && mps >= 0 ? mps * 3.6 : 0;
        smooth.current += (kmh - smooth.current) * 0.5; // light smoothing
        setCur(Math.round(smooth.current));
      },
      () => { /* permission denied / unavailable → stays at 0 */ },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // No speed-limit sign: device geolocation has no road-limit data, and a
  // constant "60" would be information the app does not actually have.
  return (
    <div aria-label={`${cur} ${t('speed.unit')}`} style={{ position: 'absolute', top: 64, left: 16, pointerEvents: 'none',
      display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', width: 48, height: 48, borderRadius: 14,
        background: 'rgba(20,23,28,.82)',
        backdropFilter: 'blur(8px)', lineHeight: 1,
        boxShadow: '0 2px 8px rgba(0,0,0,.35)',
      }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: '#fff',
          fontVariantNumeric: 'tabular-nums', letterSpacing: '-.5px' }}>{cur}</span>
        <span style={{ fontSize: 7.5, fontWeight: 600, marginTop: 1.5, letterSpacing: .2,
          textTransform: 'uppercase', color: 'rgba(255,255,255,.7)' }}>{t('speed.unit')}</span>
      </div>
    </div>
  );
});
