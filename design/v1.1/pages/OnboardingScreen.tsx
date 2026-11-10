import { useState } from 'react';
import type { ReactNode } from 'react';
import { T, TEAL_GRADIENT } from '@/constants/theme';
import { t } from '@/i18n';
import { RoleGlyph } from '@/components/ui/MapSheet';
import { getCurrentLatLng } from '@/services/geolocation';

/** First-run introduction: three short steps of how the app works, then why
    the location is needed — asked for only after it has been explained. */
export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [asking, setAsking] = useState(false);
  const slides: Array<{ title: string; body: string; art: ReactNode }> = [
    { title: t('onboard.s1Title'), body: t('onboard.s1Body'), art: (
      <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden="true">
        <circle cx="26" cy="70" r="8" fill={T.teal} /><path d="M70 14c-9 0-16 7-16 16 0 12 16 28 16 28s16-16 16-28c0-9-7-16-16-16z" fill={T.red} />
        <circle cx="70" cy="30" r="6" fill="#fff" /><path d="M30 64c14-6 18-14 30-22" stroke={T.muted} strokeWidth="3" strokeDasharray="5 7" strokeLinecap="round" />
      </svg>) },
    { title: t('onboard.s2Title'), body: t('onboard.s2Body'), art: (
      <div style={{ display: 'flex', gap: 10 }}>
        {[T.amber, T.purple, T.amber].map((c, k) => (
          <span key={k} style={{ width: 52, height: 52, borderRadius: k === 1 ? 26 : 15, background: c, border: '3px solid #fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 18px rgba(0,0,0,.35)' }}>
            <RoleGlyph type={k === 1 ? 'passenger' : 'driver'} size={24} color="#fff" />
          </span>
        ))}
      </div>) },
    { title: t('onboard.s3Title'), body: t('onboard.s3Body'), art: <span style={{ fontSize: 64 }} aria-hidden="true">🤝</span> },
    { title: t('onboard.locTitle'), body: t('onboard.locBody'), art: <span style={{ fontSize: 64 }} aria-hidden="true">📍</span> },
  ];
  const last = i === slides.length - 1;
  const s = slides[i];

  const allow = async () => {
    setAsking(true);
    await getCurrentLatLng().catch(() => null); // triggers the system prompt
    setAsking(false);
    onDone();
  };

  return (
    <div className="otw-screen" style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column',
      background: T.isDark ? 'linear-gradient(160deg,#0d1220 0%,#0f1117 60%,#111820 100%)' : `linear-gradient(160deg,${T.surface2} 0%,${T.bg} 60%,${T.stage} 100%)`,
      padding: '18px 24px calc(28px + env(safe-area-inset-bottom,0px))' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', minHeight: 44 }}>
        {!last && (
          <button onClick={() => setI(slides.length - 1)} style={{ minHeight: 44, padding: '0 12px', border: 'none', background: 'transparent',
            color: T.muted, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{t('onboard.skip')}</button>
        )}
      </div>
      <div key={i} style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'safe center',
        gap: 18, textAlign: 'center', animation: 'fadeUp .35s ease both', padding: '8px 0 16px' }}>
        <div style={{ minHeight: 110, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.art}</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: T.text, letterSpacing: '-.3px', maxWidth: 340, textWrap: 'balance' }}>{s.title}</div>
        <div style={{ fontSize: 15.5, color: T.muted, lineHeight: 1.55, maxWidth: 340, textWrap: 'pretty' }}>{s.body}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20 }} aria-hidden="true">
        {slides.map((_, k) => (
          <span key={k} style={{ width: k === i ? 22 : 7, height: 7, borderRadius: 4, background: k === i ? T.teal : T.border, transition: 'all .25s ease' }} />
        ))}
      </div>
      {last ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={allow} disabled={asking} style={{ minHeight: 54, borderRadius: 16, border: 'none', background: TEAL_GRADIENT,
            color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{t('onboard.allow')}</button>
          <button onClick={onDone} style={{ minHeight: 48, borderRadius: 14, border: `1px solid ${T.border}`, background: 'transparent',
            color: T.muted, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{t('onboard.later')}</button>
        </div>
      ) : (
        <button onClick={() => setI(i + 1)} style={{ minHeight: 54, borderRadius: 16, border: 'none', background: TEAL_GRADIENT,
          color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{t('onboard.next')}</button>
      )}
    </div>
  );
}
