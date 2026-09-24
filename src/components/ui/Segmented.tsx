import type { CSSProperties } from 'react';
import { T } from '@/constants/theme';

interface SegmentedOption { id: string; label: string; icon?: string }
interface SegmentedProps {
  options: SegmentedOption[];
  value: string;
  onChange: (id: string) => void;
  accent?: string;
  /** Vertical padding of each segment (px). */
  pad?: number;
  style?: CSSProperties;
}

/** Segmented control / sub-tab bar: pick one of `options` ({id,label,icon?}). */
export function Segmented({ options, value, onChange, accent = T.teal, pad = 8, style }: SegmentedProps) {
  return (
    <div style={{ display: 'flex', gap: 0, background: T.bg, borderRadius: 12, padding: 3, border: `1px solid ${T.border}`, ...style }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button key={o.id} onClick={() => onChange(o.id)} style={{
            flex: 1, padding: `${pad}px 0`, borderRadius: 10, border: 'none', cursor: 'pointer',
            background: on ? accent : 'transparent', color: on ? 'white' : T.muted,
            fontSize: 12, fontWeight: on ? 600 : 400, transition: 'all .2s ease', fontFamily: 'DM Sans,sans-serif',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {o.icon && <span style={{ fontSize: 11 }}>{o.icon}</span>}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
