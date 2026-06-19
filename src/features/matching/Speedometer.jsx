import { useState, useEffect, useRef } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';

/** Simulated live speedometer + road speed-limit sign (top-left HUD). */
export function Speedometer() {
  const [cur, setCur] = useState(0);
  const [limit, setLimit] = useState(60);
  const curRef = useRef(0); const targetRef = useRef(0); const limitRef = useRef(60);

  useEffect(() => {
    const LIMITS = [40, 50, 60, 70, 80];
    let segTick = 0; let tgtTick = 0;
    const id = setInterval(() => {
      if (--segTick <= 0) {
        const nl = LIMITS[Math.floor(Math.random() * LIMITS.length)];
        limitRef.current = nl; setLimit(nl);
        segTick = 18 + Math.floor(Math.random() * 12);
      }
      if (--tgtTick <= 0) {
        const lim = limitRef.current;
        if (Math.random() < 0.35) {
          targetRef.current = lim * (1.06 + Math.random() * 0.16);
          tgtTick = 5 + Math.floor(Math.random() * 4);
        } else {
          targetRef.current = lim * (0.6 + Math.random() * 0.32);
          tgtTick = 3 + Math.floor(Math.random() * 4);
        }
      }
      let v = curRef.current + (targetRef.current - curRef.current) * 0.22 + (Math.random() - 0.5) * 1.4;
      v = Math.max(0, v);
      curRef.current = v; setCur(Math.round(v));
    }, 680);
    return () => clearInterval(id);
  }, []);

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
