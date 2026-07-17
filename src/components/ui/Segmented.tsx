import { T } from '@/constants/theme';

interface SegmentedOption { id: string; label: string }
interface SegmentedProps {
  options: SegmentedOption[];
  value: string;
  onChange: (id: string) => void;
  accent?: string;
}

/** Segmented control: pick one of `options` ({id,label}). */
export function Segmented({ options, value, onChange, accent = T.teal }: SegmentedProps) {
  return (
    <div style={{ display: 'flex', gap: 0, background: T.bg, borderRadius: 12, padding: 3, border: `1px solid ${T.border}` }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button key={o.id} onClick={() => onChange(o.id)} style={{
            flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: on ? accent : 'transparent', color: on ? 'white' : T.muted,
            fontSize: 12, fontWeight: on ? 600 : 400, transition: 'all .2s ease', fontFamily: 'DM Sans,sans-serif' }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
