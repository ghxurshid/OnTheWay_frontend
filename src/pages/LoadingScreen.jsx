import { useState, useEffect } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';

/** Splash/loading screen with an animated progress bar. */
export function LoadingScreen({ onDone }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setPct((p) => { if (p >= 100) { clearInterval(id); setTimeout(onDone, 300); return 100; } return p + Math.random() * 15; });
    }, 80);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20,
      background: T.isDark
        ? 'linear-gradient(160deg,#0d1220 0%,#0f1117 100%)'
        : `linear-gradient(160deg,${T.surface2} 0%,${T.bg} 100%)` }}>
      <div style={{ width: 72, height: 72, borderRadius: 20,
        background: `linear-gradient(135deg,${T.teal},#0e9e97)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 0 40px ${T.tealGlow}` }}>
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <path d="M7 28 L18 8 L29 28 L18 22 Z" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="rgba(255,255,255,0.15)" />
          <circle cx="18" cy="22" r="3" fill="white" />
        </svg>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: T.text }}>OnTheWay</div>
      <div style={{ width: 160, height: 3, borderRadius: 2, background: T.surface2, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(pct, 100)}%`,
          background: `linear-gradient(to right,${T.teal},#0e9e97)`, transition: 'width .1s ease' }} />
      </div>
      <div style={{ fontSize: 12, color: T.muted }}>{t('loading.connecting')}</div>
    </div>
  );
}
