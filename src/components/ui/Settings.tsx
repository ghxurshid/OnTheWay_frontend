import type { ReactNode } from 'react';
import { T } from '@/constants/theme';

interface SettSectionProps { title: ReactNode; children: ReactNode }

/** Titled settings card wrapper. */
export function SettSection({ title, children }: SettSectionProps) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: T.muted, marginBottom: 8,
        textTransform: 'uppercase', letterSpacing: .8 }}>{title}</div>
      <div style={{ background: T.surface2, borderRadius: 16, padding: '4px 14px', border: `1px solid ${T.border}` }}>
        {children}
      </div>
    </div>
  );
}

interface SettToggleRowProps {
  label: ReactNode;
  sub?: ReactNode;
  value: boolean;
  onChange: (v: boolean) => void;
  icon: ReactNode;
  color: string;
}

/** Settings row with an icon, label/sub, and a toggle switch. */
export function SettToggleRow({ label, sub, value, onChange, icon, color }: SettToggleRowProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0',
      borderBottom: `1px solid ${T.border}` }}
      onClick={() => onChange(!value)}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: `${color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: T.muted }}>{sub}</div>}
      </div>
      <div onClick={(e) => { e.stopPropagation(); onChange(!value); }} style={{ cursor: 'pointer' }}>
        <div style={{ width: 44, height: 26, borderRadius: 13,
          background: value ? T.teal : T.track,
          position: 'relative', transition: 'background .2s ease' }}>
          <div style={{ position: 'absolute', top: 3,
            left: value ? 21 : 3, width: 20, height: 20, borderRadius: 10,
            background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,.3)',
            transition: 'left .2s cubic-bezier(.34,1.3,.64,1)' }} />
        </div>
      </div>
    </div>
  );
}
