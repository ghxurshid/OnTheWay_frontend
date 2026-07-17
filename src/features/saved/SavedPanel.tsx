import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { useSaved } from '@/hooks/useSaved';
import { savedStore } from '@/services/savedStore';
import type { SavedItem } from '@/models';

/** Saved items grouped into places / routes / partners, with an empty state. */
export function SavedPanel() {
  const list = useSaved();
  if (list.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '56px 32px 32px', gap: 14, textAlign: 'center' }}>
        <div style={{ width: 68, height: 68, borderRadius: 20, background: T.amberDim,
          border: `1px solid ${T.amber}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
            <path d="M12 3l2.9 5.85 6.5.95-4.7 4.6 1.1 6.45L12 17.77l-5.8 3.08L7.3 14.4 2.6 9.8l6.5-.95L12 3z"
              stroke={T.amber} strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, color: T.text }}>{t('saved.emptyTitle')}</div>
        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.55, maxWidth: 260 }}>
          {t('saved.emptyBody')}
        </div>
      </div>
    );
  }

  const groups: Record<string, SavedItem[]> = {
    place: list.filter((p) => p.type === 'place'),
    route: list.filter((p) => p.type === 'route'),
    partner: list.filter((p) => p.type === 'partner'),
  };
  const sections = [
    { key: 'place', label: t('saved.secPlaces'), icon: '📍', color: T.teal },
    { key: 'route', label: t('saved.secRoutes'), icon: '🛣️', color: T.amber },
    { key: 'partner', label: t('saved.secPartners'), icon: '👤', color: T.purple },
  ];

  return (
    <div style={{ padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10,
        background: T.amberDim, borderRadius: 12, padding: '10px 12px',
        border: `1px solid ${T.amber}30` }}>
        <span style={{ fontSize: 18 }}>⭐</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.amber }}>{t('saved.count', { n: list.length })}</div>
          <div style={{ fontSize: 10, color: T.muted }}>{t('saved.countSub')}</div>
        </div>
        <button onClick={() => { if (confirm(t('saved.confirmClear'))) savedStore.clear(); }}
          style={{ fontSize: 10, padding: '5px 10px', borderRadius: 8,
            border: `1px solid ${T.border}`, background: 'transparent',
            color: T.muted, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
          {t('common.clear')}
        </button>
      </div>

      {sections.map((sec) => groups[sec.key].length > 0 && (
        <div key={sec.key}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 13 }}>{sec.icon}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: T.muted,
              textTransform: 'uppercase', letterSpacing: .6 }}>
              {sec.label} · {groups[sec.key].length}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {groups[sec.key].map((p, i) => (
              <div key={p.id} style={{ background: T.surface2, borderRadius: 14, padding: '12px 14px',
                border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12,
                animation: `fadeUp .25s ${i * .04}s ease both` }}>
                <div style={{ width: 36, height: 36, borderRadius: 10,
                  background: `${sec.color}18`,
                  border: `1px solid ${sec.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  fontSize: 13, fontWeight: 700, color: sec.color }}>
                  {p.initials || sec.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.label}
                  </div>
                  {p.sub && (
                    <div style={{ fontSize: 11, color: T.muted,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.sub}
                    </div>
                  )}
                </div>
                <button onClick={() => savedStore.toggle(p)} title={t('saved.remove')}
                  style={{ width: 32, height: 32, borderRadius: 9,
                    background: T.amberDim, border: `1px solid ${T.amber}30`,
                    color: T.amber, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 20 20" fill={T.amber} stroke={T.amber} strokeWidth="1.6" strokeLinejoin="round">
                    <path d="M10 2.5l2.4 4.85 5.35.78-3.87 3.78.91 5.34L10 14.7l-4.79 2.55.91-5.34L2.25 8.13l5.35-.78L10 2.5z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
