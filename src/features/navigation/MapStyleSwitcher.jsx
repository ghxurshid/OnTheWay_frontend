import { useState } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { MAP_STYLES, mapStylePreviewBg } from '@/constants/map';

/** Floating basemap-style picker (dark / streets / light / satellite). */
export function MapStyleSwitcher({ current, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'absolute', right: 16, bottom: 200, pointerEvents: 'auto' }}>
      {open && (
        <div style={{ position: 'absolute', right: 0, bottom: 46, width: 184,
          background: T.glassSolid, backdropFilter: 'blur(20px)',
          borderRadius: 14, padding: '8px',
          border: `1px solid ${T.border}`,
          boxShadow: '0 8px 28px rgba(0,0,0,.45)',
          animation: 'fadeUp .2s ease both' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: T.muted,
            padding: '4px 8px 6px', textTransform: 'uppercase', letterSpacing: .6 }}>
            {t('mapui.mapStyle')}
          </div>
          {MAP_STYLES.map((s) => {
            const active = current === s.id;
            return (
              <button key={s.id} onClick={() => { onChange(s.id); setOpen(false); }}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 9, border: 'none',
                  background: active ? T.tealDim : 'transparent',
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 2,
                  fontFamily: 'DM Sans,sans-serif', transition: 'background .15s ease' }}>
                <div style={{ width: 30, height: 30, borderRadius: 8,
                  border: `1.5px solid ${active ? T.teal : 'rgba(255,255,255,.1)'}`,
                  position: 'relative', flexShrink: 0, ...mapStylePreviewBg(s.id) }}>
                  {active && (
                    <div style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: 7,
                      background: T.teal, border: `2px solid ${T.glassSolid}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, color: 'white', fontWeight: 700 }}>✓</div>
                  )}
                </div>
                <div style={{ textAlign: 'left', flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: active ? 600 : 500,
                    color: active ? T.teal : T.text }}>{t('mapStyles.' + s.id)}</div>
                  <div style={{ fontSize: 9, color: T.muted }}>{s.sub}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} title={t('mapui.mapStyle')}
        style={{ width: 36, height: 36, borderRadius: 10,
          background: open ? T.tealDim : T.glass,
          backdropFilter: 'blur(12px)',
          border: `1px solid ${open ? T.teal + '60' : T.border}`,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all .15s ease', padding: 0 }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M9 2L2 5.5L9 9L16 5.5L9 2Z" stroke={open ? T.teal : T.text} strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M2 9L9 12.5L16 9" stroke={open ? T.teal : T.text} strokeWidth="1.4" strokeLinejoin="round" opacity=".8" />
          <path d="M2 12.5L9 16L16 12.5" stroke={open ? T.teal : T.text} strokeWidth="1.4" strokeLinejoin="round" opacity=".5" />
        </svg>
      </button>
    </div>
  );
}
