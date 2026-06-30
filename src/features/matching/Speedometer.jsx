import { useState, useEffect, useRef } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';

// Device geolocation has no speed-limit data, so the sign shows a static city
// reference. Real limits would need a roads/maps API.
const DEFAULT_LIMIT = 60;

/** Live speedometer driven by the device's GPS speed (top-left HUD). */
export function Speedometer() {
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

  const limit = DEFAULT_LIMIT;
  const over = cur > limit;
  return (
    <div style={{ position: 'absolute', top: 64, left: 16, pointerEvents: 'none',
      display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', width: 48, height: 48, borderRadius: 14,
        background: over ? T.red : 'rgba(20,23,28,.82)',
        backdropFilter: 'blur(8px)', lineHeight: 1,
        boxShadow: '0 2px 8px rgba(0,0,0,.35)',
        transition: 'background .3s ease' }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: '#fff',
          fontVariantNumeric: 'tabular-nums', letterSpacing: '-.5px' }}>{cur}</span>
        <span style={{ fontSize: 7.5, fontWeight: 600, marginTop: 1.5, letterSpacing: .2,
          textTransform: 'uppercase', color: 'rgba(255,255,255,.7)' }}>{t('speed.unit')}</span>
      </div>
      <div style={{ position: 'relative', width: 44, height: 44 }}>
        {over && <div style={{ position: 'absolute', inset: -3, borderRadius: '50%',
          border: `2px solid ${T.red}`, animation: 'pulse 1s ease infinite' }} />}
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#fff',
          border: '5px solid #e8403a', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,.35)' }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: '#16181d',
            fontVariantNumeric: 'tabular-nums' }}>{limit}</span>
        </div>
      </div>
    </div>
  );
}
