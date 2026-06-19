import { useRef, useEffect } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { hLabel } from '@/utils/datetime';

/** Dual-thumb time-range slider (hours). */
export function TimeRangeSlider({ start, end, onChange, min = 6, max = 24 }) {
  const trackRef = useRef(null);
  const dragRef = useRef(null);
  const pct = (v) => ((v - min) / (max - min)) * 100;
  const valFromX = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    let p = (clientX - r.left) / r.width; p = Math.max(0, Math.min(1, p));
    return Math.round(min + p * (max - min));
  };
  useEffect(() => {
    const move = (e) => {
      if (!dragRef.current) return;
      const v = valFromX(e.clientX);
      if (dragRef.current === 's') onChange(Math.min(v, end - 1), end);
      else onChange(start, Math.max(v, start + 1));
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  });
  const thumb = (which, v) => (
    <div onPointerDown={() => { dragRef.current = which; }} style={{
      position: 'absolute', left: `${pct(v)}%`, top: '50%', transform: 'translate(-50%,-50%)',
      width: 22, height: 22, borderRadius: 11, background: '#fff', border: `3px solid ${T.teal}`,
      boxShadow: '0 2px 6px rgba(0,0,0,.4)', cursor: 'grab', touchAction: 'none', zIndex: 2 }} />
  );
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.teal, fontVariantNumeric: 'tabular-nums' }}>{hLabel(start)}</span>
        <span style={{ fontSize: 10, color: T.muted }}>{t('form.timeRange')}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.teal, fontVariantNumeric: 'tabular-nums' }}>{hLabel(end)}</span>
      </div>
      <div ref={trackRef} style={{ position: 'relative', height: 22, margin: '0 8px' }}>
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 4, marginTop: -2, borderRadius: 2, background: T.surface2 }} />
        <div style={{ position: 'absolute', top: '50%', height: 4, marginTop: -2, borderRadius: 2,
          left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%`, background: T.teal }} />
        {thumb('s', start)}
        {thumb('e', end)}
      </div>
    </div>
  );
}
