import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { fmt12 } from '@/utils/datetime';
import type { RouteData, Walker } from '@/models';

/** The 'preview' navTask: a walker with their server-loaded route. */
export interface PreviewTask {
  walker: Walker;
  loading?: boolean;
  data?: RouteData | null;
  dist?: number;
}

interface WalkerPreviewCardProps {
  task: PreviewTask;
  onBack: () => void;
  onCall: (w: Walker) => void;
  onChat: (w: Walker) => void;
}

/** Minimized card showing a walker's server-loaded route preview + actions.
 *  Arrangements are made over chat/call (there is no booking request). */
export function WalkerPreviewCard({ task, onBack, onCall, onChat }: WalkerPreviewCardProps) {
  const w = task.walker;
  const { loading, data, dist } = task;
  const isDriver = w.type === 'driver';
  const color = isDriver ? T.amber : T.purple;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 24, pointerEvents: 'none' }}>
      <button onClick={onBack} style={{ position: 'absolute', top: 64, left: 16, pointerEvents: 'auto',
        height: 38, padding: '0 14px 0 10px', borderRadius: 12, background: T.glass,
        backdropFilter: 'blur(12px)', border: `1px solid ${T.border}`, color: T.text, fontSize: 13,
        fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        fontFamily: 'DM Sans,sans-serif', boxShadow: '0 4px 14px rgba(0,0,0,.4)' }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M9 2L4 7L9 12" stroke={T.text} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t('common.list')}
      </button>

      {loading && (
        <div style={{ position: 'absolute', top: '46%', left: '50%', transform: 'translate(-50%,-50%)',
          background: T.glass2, backdropFilter: 'blur(12px)', borderRadius: 20,
          padding: '9px 18px', border: `1px solid ${T.teal}40`, display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, border: `2px solid ${T.teal}`,
            borderTopColor: 'transparent', animation: 'spin .7s linear infinite' }} />
          <span style={{ fontSize: 12, color: T.teal, fontWeight: 600 }}>{t('preview.loading')}</span>
        </div>
      )}

      <div style={{ position: 'absolute', left: 12, right: 12, bottom: 20, pointerEvents: 'auto',
        background: T.glass2, backdropFilter: 'blur(20px)', borderRadius: 20,
        border: `1px solid ${color}35`, boxShadow: '0 10px 30px rgba(0,0,0,.55)',
        padding: '14px 16px 16px', animation: 'fadeUp .3s ease both' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: `${color}20`,
            border: `1.5px solid ${color}45`, display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color }}>{w.initials}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{w.name}</span>
              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 5, background: `${color}20`,
                color, fontWeight: 600 }}>{isDriver ? '🚗' : '🧑‍✈️'} {isDriver ? w.vehicle : t('walkerCard.passengerTag')}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, fontSize: 11, color: T.muted }}>
              <span>🕐 {fmt12(w.when)}</span>
              <span style={{ color: T.amber }}>★ {w.rating}</span>
              {dist != null && isFinite(dist) && <span>📍 {dist.toFixed(1)} km</span>}
            </div>
          </div>
        </div>

        <div style={{ background: T.bg, borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: T.teal, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.from}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: T.red, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.to}</span>
          </div>
          {data && (
            <div style={{ display: 'flex', gap: 12, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 11, color: T.muted }}>📏 <b style={{ color: T.text }}>{data.distanceKm.toFixed(1)} km</b></span>
              <span style={{ fontSize: 11, color: T.muted }}>⏱ <b style={{ color: T.text }}>{Math.round(data.durationMin)} min</b></span>
              <span style={{ fontSize: 11, color: T.teal, marginLeft: 'auto' }}>● {t('preview.fromServer')}</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => onCall(w)} style={{ flex: 1, padding: '12px', borderRadius: 13, border: 'none',
            background: `linear-gradient(135deg,${T.teal},#0e9e97)`, color: 'white', fontSize: 14,
            fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
            boxShadow: `0 4px 16px ${T.tealGlow}`, display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 7 }}>📞 {t('common.call')}</button>
          <button onClick={() => onChat(w)} style={{ padding: '0 18px', borderRadius: 13,
            border: `1px solid ${T.border}`, background: 'transparent', color: T.text, fontSize: 14,
            fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>💬</button>
        </div>
      </div>
    </div>
  );
}
