import type { CSSProperties } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { useSimCount } from '@/hooks/useSimCount';

/** Stepper + slider controlling how many nearby walkers to simulate (1..10). */
export function SimCountRow() {
  const [n, setN] = useSimCount();
  const stepBtn: CSSProperties = {
    width: 30, height: 30, borderRadius: 9, cursor: 'pointer',
    border: `1px solid ${T.border}`, background: T.bg, color: T.text,
    fontSize: 18, fontWeight: 600, fontFamily: 'DM Sans,sans-serif',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  return (
    <div style={{ padding: '11px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: `${T.teal}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>📍</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{t('settings.walkerShown')}</div>
          <div style={{ fontSize: 11, color: T.muted }}>{t('settings.walkerSub')}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setN(Math.max(1, n - 1))} style={stepBtn}>−</button>
          <span style={{ fontSize: 17, fontWeight: 700, color: T.teal, minWidth: 20, textAlign: 'center' }}>{n}</span>
          <button onClick={() => setN(Math.min(10, n + 1))} style={stepBtn}>+</button>
        </div>
      </div>
      <input type="range" min="1" max="10" step="1" value={n}
        onChange={(e) => setN(parseInt(e.target.value, 10))}
        style={{ width: '100%', marginTop: 14, accentColor: T.teal, cursor: 'pointer' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ fontSize: 9, color: T.muted }}>1</span>
        <span style={{ fontSize: 9, color: T.muted }}>10</span>
      </div>
    </div>
  );
}
