import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { fmt12 } from '@/utils/datetime';

/** Compact walker (driver/passenger) list card used by the schedule results. */
export function WalkerCard({ walker: w, idx, dist, onSelect }) {
  const isDriver = w.type === 'driver';
  const color = isDriver ? T.amber : T.purple;
  return (
    <button onClick={onSelect} style={{ width: '100%', textAlign: 'left', background: T.surface2,
      borderRadius: 16, border: `1px solid ${T.border}`, cursor: 'pointer', padding: '12px 14px',
      display: 'flex', gap: 12, alignItems: 'center', fontFamily: 'DM Sans,sans-serif',
      transition: 'border-color .2s ease', animation: `fadeUp .3s ${idx * 0.04}s ease both` }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: `${color}20`,
          border: `1.5px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color }}>{w.initials}</span>
        </div>
        <div style={{ position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: 6,
          background: T.green, border: `2px solid ${T.surface2}` }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 5, background: `${color}20`,
            color, fontWeight: 600, flexShrink: 0 }}>{isDriver ? '🚗' : '🧑‍✈️'} {isDriver ? w.vehicle : t('walkerCard.passengerTag')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: T.teal, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.from}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: T.red, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.to}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{fmt12(w.when)}</div>
        <div style={{ fontSize: 10, color: T.muted }}>{dist != null && isFinite(dist) ? dist.toFixed(1) + ' km' : ''}</div>
        <div style={{ fontSize: 10, color: T.amber }}>★ {w.rating}</div>
      </div>
      <svg width="8" height="14" viewBox="0 0 8 14" fill="none" style={{ flexShrink: 0, opacity: .5 }}>
        <path d="M1 1L7 7L1 13" stroke={T.muted} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
