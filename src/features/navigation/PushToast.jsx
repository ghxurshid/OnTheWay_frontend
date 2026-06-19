import { useEffect } from 'react';
import { T } from '@/constants/theme';

/** Transient push-notification toast (match found / new message). */
export function PushToast({ notif, onDismiss, onView }) {
  useEffect(() => {
    if (!notif) return;
    const id = setTimeout(() => onDismiss(), notif.duration || 6500);
    return () => clearTimeout(id);
  }, [notif]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!notif) return null;
  const color = notif.user?.type === 'driver' ? T.amber : T.teal;
  return (
    <div style={{ position: 'absolute', top: 14, left: 16, right: 16, zIndex: 35, pointerEvents: 'auto',
      animation: 'pushSlide .45s cubic-bezier(.34,1.56,.64,1) both' }}>
      <style>{`
        @keyframes pushGlow{0%,100%{box-shadow:0 8px 28px rgba(0,0,0,.5),0 0 0 1px ${T.teal}40}
          50%{box-shadow:0 8px 28px rgba(0,0,0,.5),0 0 0 1px ${T.teal}aa,0 0 28px ${T.tealGlow}}}
      `}</style>
      <div style={{ background: T.glass2, backdropFilter: 'blur(24px)',
        borderRadius: 18, padding: '12px 12px 12px 14px', display: 'flex', alignItems: 'center', gap: 11,
        animation: 'pushGlow 2s ease-in-out 1' }}>
        <div style={{ width: 42, height: 42, borderRadius: 13,
          background: `linear-gradient(135deg,${color},${color}aa)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, position: 'relative' }}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M11 3a5 5 0 0 0-5 5v3.5l-1.5 1.5h13L16 11.5V8a5 5 0 0 0-5-5Z" fill="white" />
            <path d="M9 16a2 2 0 0 0 4 0" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <div style={{ position: 'absolute', top: -2, right: -2, width: 11, height: 11, borderRadius: 6,
            background: T.red, border: `2px solid ${T.glass2}`,
            animation: 'pulse 1.4s ease infinite' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {notif.title}
          </div>
          <div style={{ fontSize: 11, color: T.muted,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {notif.body}
          </div>
        </div>
        {notif.action && onView && (
          <button onClick={() => onView(notif)}
            style={{ padding: '7px 12px', borderRadius: 9, border: 'none',
              background: T.teal, color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'DM Sans,sans-serif', whiteSpace: 'nowrap' }}>
            {notif.action}
          </button>
        )}
        <button onClick={onDismiss}
          style={{ width: 24, height: 24, borderRadius: 6, border: 'none',
            background: 'transparent', color: T.muted, cursor: 'pointer', fontSize: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1l8 8M9 1L1 9" stroke={T.muted} strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
