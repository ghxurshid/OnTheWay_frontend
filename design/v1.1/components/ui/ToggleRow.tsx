import type { ReactNode } from 'react';
import { T } from '@/constants/theme';

interface ToggleRowProps {
  label: ReactNode;
  /** Secondary line — usually explains what the current state means. */
  sub: ReactNode;
  checked: boolean;
  onToggle: () => void;
  /** Icon tile glyph; it is tinted with `accent` by the caller. */
  icon: ReactNode;
  /** Colour of the "on" state (teal for Free Mode, red for Busy). */
  accent?: string;
  disabled?: boolean;
}

/** Switch row used by the side drawer's status toggles (Free Mode, Busy).
 *  One component so both rows share the same shell, spacing, hover/active
 *  feedback and a11y contract — only the label, icon and accent differ. */
export function ToggleRow({ label, sub, checked, onToggle, icon, accent = T.teal, disabled = false }: ToggleRowProps) {
  const on = !disabled && checked;
  return (
    <button className="otw-toggle-row" role="switch" aria-checked={on} aria-disabled={disabled}
      disabled={disabled} onClick={disabled ? undefined : onToggle}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 13,
        width: '100%', textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'DM Sans,sans-serif', opacity: disabled ? 0.6 : 1,
        border: `1.5px solid ${on ? accent + '60' : T.border}`,
        background: on ? `${accent}14` : T.surface2 }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0,
        background: `${accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{label}</div>
        <div style={{ fontSize: 11.5, color: on ? accent : T.muted }}>{sub}</div>
      </div>
      {/* Pill switch */}
      <div style={{ width: 40, height: 23, borderRadius: 12, flexShrink: 0, position: 'relative',
        background: on ? accent : T.border, transition: 'background .2s ease' }}>
        <div style={{ position: 'absolute', top: 2.5, left: on ? 19.5 : 2.5, width: 18, height: 18,
          borderRadius: 9, background: '#fff', transition: 'left .2s ease',
          boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
      </div>
    </button>
  );
}
