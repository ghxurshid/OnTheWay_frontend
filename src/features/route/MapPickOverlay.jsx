import { useState, useRef, useEffect } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { reverseGeocode } from '@/services/geocodingService';

/** Drag-the-map center-pin picker used by schedule filter/add fields. */
export function MapPickOverlay({ mapHook, label, initial, onConfirm, onCancel }) {
  const [addr, setAddr] = useState('');
  const [loading, setLoading] = useState(true);
  const centerRef = useRef(null);
  const cleanupRef = useRef(null);
  const debRef = useRef(null);

  const refresh = () => {
    const c = mapHook.getCenter(); if (!c) return;
    centerRef.current = c;
    setLoading(true);
    clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      const here = mapHook.getCenter() || c;
      const lbl = await reverseGeocode(here);
      centerRef.current = here; setAddr(lbl); setLoading(false);
    }, 400);
  };
  useEffect(() => {
    if (initial) mapHook.flyTo(initial, 16);
    const tm = setTimeout(() => {
      const c1 = mapHook.onMove(() => setLoading(true));
      const c2 = mapHook.onMoveEnd(() => refresh());
      cleanupRef.current = () => { c1 && c1(); c2 && c2(); };
      refresh();
    }, initial ? 850 : 60);
    return () => { clearTimeout(tm); if (cleanupRef.current) cleanupRef.current(); clearTimeout(debRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const confirm = () => {
    const c = centerRef.current || mapHook.getCenter();
    if (c) onConfirm({ latlng: c, label: addr || `${c[0].toFixed(4)}, ${c[1].toFixed(4)}` });
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 24, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)',
        background: T.glass2, backdropFilter: 'blur(12px)', borderRadius: 20,
        padding: '7px 16px', border: `1px solid ${T.teal}40`, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 12, color: T.teal, fontWeight: 600 }}>{label} — {t('route.dragMap')}</span>
      </div>

      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-100%)',
        pointerEvents: 'none', zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ maxWidth: 230, background: T.glass2, backdropFilter: 'blur(12px)',
          borderRadius: 12, padding: '8px 12px', marginBottom: 8, border: `1px solid ${T.border}`,
          boxShadow: '0 6px 20px rgba(0,0,0,.5)' }}>
          <div style={{ fontSize: 12, color: T.text, fontWeight: 600, textAlign: 'center',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {loading ? t('route.detecting') : (addr || t('route.pickPlace'))}
          </div>
        </div>
        <svg width="34" height="42" viewBox="0 0 34 42" style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.5))' }}>
          <path d="M17 1C8.7 1 2 7.7 2 16c0 10.5 15 25 15 25s15-14.5 15-25C32 7.7 25.3 1 17 1z"
            fill={T.teal} stroke="#fff" strokeWidth="2" />
          <circle cx="17" cy="16" r="5.5" fill="#fff" />
        </svg>
      </div>
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
        width: 8, height: 8, borderRadius: 4, background: 'rgba(0,0,0,.4)',
        border: '1px solid rgba(255,255,255,.5)', pointerEvents: 'none', zIndex: 4 }} />

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: T.surface,
        borderRadius: '20px 20px 0 0', padding: '16px 20px 28px', borderTop: `1px solid ${T.border}`,
        pointerEvents: 'auto', zIndex: 6, animation: 'slideUp .3s cubic-bezier(.34,1.2,.64,1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 11, background: T.tealDim,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>📍</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: T.muted }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {loading ? t('route.detecting') : (addr || t('route.dragMapShort'))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ padding: '13px 18px', borderRadius: 13,
            border: `1px solid ${T.border}`, background: 'transparent', color: T.muted, fontSize: 14,
            fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{t('common.cancel')}</button>
          <button onClick={confirm} disabled={loading || !addr} style={{ flex: 1, padding: '13px',
            borderRadius: 13, border: 'none',
            background: (loading || !addr) ? T.surface2 : `linear-gradient(135deg,${T.teal},#0e9e97)`,
            color: (loading || !addr) ? T.muted : 'white', fontSize: 15, fontWeight: 600,
            cursor: (loading || !addr) ? 'not-allowed' : 'pointer',
            boxShadow: (loading || !addr) ? 'none' : `0 4px 18px ${T.tealGlow}`,
            fontFamily: 'DM Sans,sans-serif', transition: 'all .2s ease' }}>{t('common.confirm')}</button>
        </div>
      </div>
    </div>
  );
}
