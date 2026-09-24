import { useState, useEffect } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { AppLogo } from '@/components/ui/AppLogo';

/** Splash/loading screen with an animated progress bar. */
export function LoadingScreen({ onDone }: { onDone: () => void }) {
  const [pct, setPct] = useState(0);
  const done = pct >= 100;

  useEffect(() => {
    if (done) return undefined;
    const id = setInterval(() => setPct((p) => Math.min(100, p + Math.random() * 15)), 80);
    return () => clearInterval(id);
  }, [done]);

  useEffect(() => {
    if (!done) return undefined;
    const id = setTimeout(onDone, 300);
    return () => clearTimeout(id);
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps -- fires once, when the bar fills

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20,
      background: T.isDark
        ? 'linear-gradient(160deg,#0d1220 0%,#0f1117 100%)'
        : `linear-gradient(160deg,${T.surface2} 0%,${T.bg} 100%)` }}>
      <AppLogo />
      <div style={{ fontSize: 22, fontWeight: 700, color: T.text }}>OnTheWay</div>
      <div style={{ width: 160, height: 3, borderRadius: 2, background: T.surface2, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 2, width: `${pct}%`,
          background: `linear-gradient(to right,${T.teal},#0e9e97)`, transition: 'width .1s ease' }} />
      </div>
      <div style={{ fontSize: 12, color: T.muted }}>{t('loading.connecting')}</div>
    </div>
  );
}
