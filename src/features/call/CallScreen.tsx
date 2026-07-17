import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { ME } from '@/constants/app';
import type { PartyType } from '@/models';

interface CallParty {
  name: string;
  sub?: string;
  initials: string;
  photoUrl?: string | null;
  accent?: string;
  type?: PartyType;
}

interface CallScreenProps {
  callee: CallParty;
  phase: string;
  onAccept?: () => void;
  onDecline?: () => void;
  onEnd?: () => void;
  onAgree?: () => void;
  onMuteToggle?: (muted: boolean) => void;
  live?: boolean;
  role?: 'caller' | 'callee';
}

const partyColor = (p: CallParty) => (p.accent ? p.accent : (p.type === 'driver' ? T.amber : T.purple));

/** Call screen (ringing/active) with a "ride together" offer.
    Real calls (`live`): always shows the REMOTE party (`callee` prop — the
    actual caller when role='callee') and the buttons drive the CallHub via the
    parent's handlers. Demo mode keeps the dual-perspective flip view. */
export function CallScreen({ callee, phase, onAccept, onDecline, onEnd, onAgree, onMuteToggle, live = false, role = 'caller' }: CallScreenProps) {
  const caller: CallParty = { ...ME, accent: T.teal }; // demo-mode "you"
  const [secs, setSecs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [view, setView] = useState(role === 'callee' ? 'callee' : 'caller'); // 'caller' | 'callee'
  const ringing = phase === 'ringing';
  const [agreed, setAgreed] = useState(false);
  const agree = () => { setAgreed(true); onAgree && onAgree(); };
  const toggleMute = () => setMuted((m) => { onMuteToggle && onMuteToggle(!m); return !m; });

  useEffect(() => {
    if (phase === 'active') { const i = setInterval(() => setSecs((c) => c + 1), 1000); return () => clearInterval(i); }
  }, [phase]);

  useEffect(() => {
    if (!ringing || live) return; // real calls stay on the owner's perspective
    const i = setInterval(() => setView((v) => (v === 'caller' ? 'callee' : 'caller')), 2800);
    return () => clearInterval(i);
  }, [ringing, live]);

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // Live calls have no perspective to flip: `onCaller` is fixed by our role and
  // the person on screen is always the remote party. Demo mode alternates views.
  const onCaller = live ? role === 'caller' : view === 'caller';
  const shown = live ? callee : (onCaller ? callee : caller);
  const color = partyColor(shown);
  const flip = () => setView((v) => (v === 'caller' ? 'callee' : 'caller'));

  const status = phase === 'active' ? fmt(secs) : onCaller ? t('call.calling') : t('call.incoming');

  return (
    <div className="otw-screen" style={{ position: 'absolute', inset: 0, zIndex: 30,
      background: T.isDark
        ? 'linear-gradient(160deg,#0d1220 0%,#0f1117 50%,#0a1018 100%)'
        : `linear-gradient(160deg,${T.surface2} 0%,${T.bg} 50%,${T.stage} 100%)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'calc(24px + env(safe-area-inset-top,0px)) 24px calc(60px + env(safe-area-inset-bottom,0px))' }}>

      {live
        ? <div style={{ fontSize: 10.5, color: T.muted, letterSpacing: .4, marginBottom: 30,
            minHeight: 14 }}>
            {ringing ? '' : t('call.connected')}
          </div>
        : <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6,
              background: T.hover, border: `1px solid ${T.border}`,
              borderRadius: 999, padding: '6px 8px 6px 14px' }}>
              <div style={{ width: 7, height: 7, borderRadius: 4, flexShrink: 0,
                background: onCaller ? T.teal : color,
                boxShadow: `0 0 8px ${onCaller ? T.teal : color}` }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: T.text, whiteSpace: 'nowrap' }}>
                {onCaller ? t('call.yourScreen') : t('call.theirScreen', { name: callee.name.split(' ')[0] })}
              </span>
              <button onClick={flip} title={t('call.flipTip')} style={{
                width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                border: `1px solid ${T.border}`, background: T.hover,
                color: T.muted, cursor: 'pointer', fontSize: 13,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⇄</button>
            </div>
            <div style={{ fontSize: 10.5, color: T.muted, letterSpacing: .4, marginBottom: 30 }}>
              {ringing ? t('call.bothViews') : t('call.connected')}
            </div>
          </>}

      <div style={{ position: 'absolute', top: '22%', left: '50%', transform: 'translateX(-50%)',
        width: 280, height: 280, borderRadius: 140,
        background: `radial-gradient(circle,${color}12 0%,transparent 70%)`, pointerEvents: 'none' }} />

      <div key={view + phase} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
        width: '100%', animation: 'fadeUp .35s ease both', position: 'relative', zIndex: 1 }}>
        <div style={{ position: 'relative', marginBottom: 26 }}>
          {ringing && [1, 2, 3].map((i) => (
            <div key={i} style={{ position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%,-50%)', width: 80 + i * 36, height: 80 + i * 36, borderRadius: '50%',
              border: `1px solid ${color}${Math.round(22 / i).toString(16).padStart(2, '0')}`,
              animation: `ripple ${1 + i * .4}s ${i * .2}s ease-out infinite` }} />
          ))}
          <div style={{ width: 88, height: 88, borderRadius: 28, background: `${color}25`,
            border: `2.5px solid ${color}60`, display: 'flex', alignItems: 'center',
            justifyContent: 'center', position: 'relative', zIndex: 1, overflow: 'hidden' }}>
            {shown.photoUrl
              ? <img src={shown.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 32, fontWeight: 700, color }}>{shown.initials}</span>}
          </div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.text, textAlign: 'center',
          lineHeight: 1.25, maxWidth: 300, textWrap: 'balance' }}>{shown.name}</div>
        <div style={{ fontSize: 13, color: T.muted, textAlign: 'center', marginTop: 6,
          maxWidth: 300, lineHeight: 1.4 }}>{shown.sub}</div>
        {phase === 'active'
          ? <div style={{ fontSize: 18, color: T.teal, fontVariantNumeric: 'tabular-nums', marginTop: 14, fontWeight: 600 }}>{status}</div>
          : <div style={{ fontSize: 14, color, animation: 'pulse 1.2s ease infinite', marginTop: 14 }}>{status}</div>}
      </div>

      {phase === 'active' && (
        <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginBottom: 44, height: 32 }}>
          {[4, 8, 14, 10, 18, 12, 6, 16, 9, 12, 7].map((h, i) => (
            <div key={i} style={{ width: 3, borderRadius: 2, height: h,
              background: muted ? T.muted : T.teal, opacity: muted ? .4 : 1,
              animation: `dotBounce ${.4 + i * .05}s ${i * .07}s ease-in-out infinite` }} />
          ))}
        </div>
      )}

      {phase === 'active'
        ? <div style={{ marginTop: 'auto', width: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 18 }}>
            {agreed
              ? <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11,
                  background: T.green + '1c', border: `1px solid ${T.green}55`, borderRadius: 15,
                  padding: '12px 14px', animation: 'fadeUp .3s ease both' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: T.green, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, color: '#fff' }}>✓</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: T.green }}>{t('call.agreedTitle')}</div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{t('call.agreedSub', { name: callee.name.split(' ')[0] })}</div>
                  </div>
                </div>
              : onCaller
                ? <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                    background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 999,
                    padding: '8px 16px', animation: 'fadeUp .3s ease both' }}>
                    <div style={{ width: 6, height: 6, borderRadius: 3, background: T.amber,
                      animation: 'pulse 1.1s ease infinite' }} />
                    <span style={{ fontSize: 12, color: T.muted, fontWeight: 500 }}>{t('call.offerPending')}</span>
                  </div>
                : <div style={{ width: '100%', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: 9, animation: 'fadeUp .3s ease both' }}>
                    <button onClick={agree}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                        background: T.green, border: 'none', borderRadius: 15, padding: '15px 18px',
                        cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
                        boxShadow: `0 6px 22px ${T.green}55` }}>
                      <span style={{ fontSize: 19 }}>🤝</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{t('call.agreeBtn')}</span>
                    </button>
                    <div style={{ fontSize: 11, color: T.muted, textAlign: 'center',
                      lineHeight: 1.45, maxWidth: 280 }}>{t('call.offerHint')}</div>
                  </div>}
            <div style={{ display: 'flex', gap: 20 }}>
              <CallBtn icon={muted ? '🔇' : '🎙'} label={muted ? t('call.unmute') : t('call.mute')} color={T.surface2} small onClick={toggleMute} />
              <CallBtn icon="✕" label={t('call.end')} color={T.red} onClick={onEnd} />
              <CallBtn icon="📢" label={t('call.speaker')} color={T.surface2} small />
            </div>
          </div>
        : onCaller
          ? <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'auto' }}>
              <CallBtn icon="✕" label={t('call.cancel')} color={T.red} onClick={onDecline} />
            </div>
          : <div style={{ display: 'flex', gap: 40, marginTop: 'auto' }}>
              <CallBtn icon="✕" label={t('call.decline')} color={T.red} onClick={onDecline} />
              <CallBtn icon="✓" label={t('call.accept')} color={T.green} onClick={onAccept} />
            </div>}
    </div>
  );
}

interface CallBtnProps { icon: ReactNode; label: ReactNode; color: string; onClick?: () => void; small?: boolean }

function CallBtn({ icon, label, color, onClick, small }: CallBtnProps) {
  const [p, setP] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <button onClick={onClick}
        onPointerDown={() => setP(true)} onPointerUp={() => setP(false)} onPointerLeave={() => setP(false)}
        style={{ width: small ? 54 : 64, height: small ? 54 : 64, borderRadius: '50%',
          background: color, border: 'none', cursor: 'pointer', fontSize: small ? 20 : 24,
          transform: p ? 'scale(.88)' : 'scale(1)', transition: 'transform .15s ease',
          boxShadow: color === T.green ? `0 4px 20px ${T.green}40` : color === T.red ? `0 4px 20px ${T.red}40` : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </button>
      <span style={{ fontSize: 11, color: T.muted }}>{label}</span>
    </div>
  );
}
