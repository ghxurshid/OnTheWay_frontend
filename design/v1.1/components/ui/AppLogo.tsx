import { T, TEAL_GRADIENT } from '@/constants/theme';

/** The OnTheWay app mark: a glowing teal tile with the route arrow. */
export function AppLogo() {
  return (
    <div style={{ width: 72, height: 72, borderRadius: 20,
      background: TEAL_GRADIENT,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: `0 0 40px ${T.tealGlow}` }}>
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <path d="M7 28 L18 8 L29 28 L18 22 Z" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="rgba(255,255,255,0.15)" />
        <circle cx="18" cy="22" r="3" fill="white" />
      </svg>
    </div>
  );
}
