import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';

type Role = 'passenger' | 'driver';

/** Role-selection landing screen (passenger / driver). */
export function HomeScreen({ onSelect }: { onSelect: (role: Role) => void }) {
  const [in_, setIn] = useState(false);
  useEffect(() => { const id = setTimeout(() => setIn(true), 80); return () => clearTimeout(id); }, []);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'space-between', padding: 'env(safe-area-inset-top,0px) 24px calc(44px + env(safe-area-inset-bottom,0px))',
      background: T.isDark
        ? 'linear-gradient(160deg,#0d1220 0%,#0f1117 60%,#111820 100%)'
        : `linear-gradient(160deg,${T.surface2} 0%,${T.bg} 60%,${T.stage} 100%)` }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 16,
        opacity: in_ ? 1 : 0, transform: in_ ? 'none' : 'translateY(20px)',
        transition: 'all .6s cubic-bezier(.34,1.56,.64,1)' }}>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <div style={{ width: 72, height: 72, borderRadius: 20,
            background: `linear-gradient(135deg,${T.teal},#0e9e97)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 40px ${T.tealGlow}` }}>
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <path d="M7 28 L18 8 L29 28 L18 22 Z" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="rgba(255,255,255,0.15)" />
              <circle cx="18" cy="22" r="3" fill="white" />
            </svg>
          </div>
          <div style={{ position: 'absolute', inset: -3, borderRadius: 23,
            border: `1.5px solid ${T.tealGlow}`, animation: 'pulse 2s ease infinite' }} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: T.text, letterSpacing: '-.5px' }}>OnTheWay</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>{t('home.tagline')}</div>
        </div>
      </div>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12,
        opacity: in_ ? 1 : 0, transform: in_ ? 'none' : 'translateY(30px)',
        transition: 'all .6s .2s cubic-bezier(.34,1.56,.64,1)' }}>
        <RoleBtn icon="🚗" label={t('home.passengerLabel')} sub={t('home.passengerSub')} color={T.teal} onClick={() => onSelect('passenger')} />
        <RoleBtn icon="🧑‍✈️" label={t('home.driverLabel')} sub={t('home.driverSub')} color={T.amber} onClick={() => onSelect('driver')} />
      </div>
    </div>
  );
}

interface RoleBtnProps { icon: ReactNode; label: ReactNode; sub: ReactNode; color: string; onClick: () => void }

function RoleBtn({ icon, label, sub, color, onClick }: RoleBtnProps) {
  const [p, setP] = useState(false);
  return (
    <button onClick={onClick} onPointerDown={() => setP(true)} onPointerUp={() => setP(false)} onPointerLeave={() => setP(false)}
      style={{ width: '100%', padding: '18px 20px', borderRadius: 16, border: `1.5px solid ${color}30`,
        background: p ? `${color}20` : `${color}0d`, display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer',
        transform: p ? 'scale(0.97)' : 'scale(1)', transition: 'all .15s ease', fontFamily: 'DM Sans,sans-serif',
        boxShadow: p ? `0 0 20px ${color}20` : 'none' }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}20`, fontSize: 22,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: T.text }}>{label}</div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{ marginLeft: 'auto', color: T.muted }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 4 L10 8 L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    </button>
  );
}
