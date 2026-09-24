import type { ReactNode } from 'react';
import { T, TEAL_GRADIENT } from '@/constants/theme';

interface PrimaryButtonProps { enabled: boolean; onClick: () => void; children: ReactNode }

/** Full-width gradient CTA with a disabled (muted) state. */
export function PrimaryButton({ enabled, onClick, children }: PrimaryButtonProps) {
  return (
    <button onClick={() => enabled && onClick()} style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none',
      background: enabled ? TEAL_GRADIENT : T.surface2,
      color: enabled ? 'white' : T.muted, fontSize: 15, fontWeight: 600,
      cursor: enabled ? 'pointer' : 'not-allowed',
      boxShadow: enabled ? `0 4px 20px ${T.tealGlow}` : 'none',
      fontFamily: 'DM Sans,sans-serif', transition: 'all .2s ease' }}>{children}</button>
  );
}
