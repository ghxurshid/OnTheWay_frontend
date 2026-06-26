import { useState } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { useHistory } from '@/hooks/useHistory';
import { historyTotals } from '@/services/historyService';
import { Spinner } from '@/components/ui/Spinner';
import { Dashboard } from './Dashboard';

/** Trip history list + dashboard tabs. */
export function HistoryPanel() {
  const { history, loading } = useHistory();
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('history'); // 'history' | 'dashboard'
  const { totalTrips, totalKm } = historyTotals(history);

  const TABS = [
    { id: 'history', label: t('history.tabHistory'), icon: '🕒' },
    { id: 'dashboard', label: t('history.tabDashboard'), icon: '📊' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 0, margin: '12px 16px 0', background: T.bg,
        borderRadius: 12, padding: 3, border: `1px solid ${T.border}`, flexShrink: 0 }}>
        {TABS.map((tb) => (
          <button key={tb.id} onClick={() => setTab(tb.id)} style={{
            flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: tab === tb.id ? T.teal : 'transparent',
            color: tab === tb.id ? 'white' : T.muted,
            fontSize: 12, fontWeight: tab === tb.id ? 600 : 400,
            transition: 'all .2s ease', fontFamily: 'DM Sans,sans-serif',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 11 }}>{tb.icon}</span>{tb.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <div style={{ flex: 1, overflowY: 'auto' }}><Dashboard /></div>
      )}

      {tab === 'history' && (
        loading ? <Spinner /> : (
          <>
            {/* Stats row */}
            <div style={{ display: 'flex', gap: 10, padding: '12px 16px 10px', flexShrink: 0 }}>
              {[
                { label: t('history.statTrips'), val: totalTrips, unit: t('history.unitTrips'), color: T.teal },
                { label: t('history.statDistance'), val: totalKm, unit: 'km', color: T.amber },
                { label: t('history.statRating'), val: '4.9', unit: '⭐', color: T.purple },
              ].map((s) => (
                <div key={s.label} style={{ flex: 1, background: T.surface2, borderRadius: 14,
                  padding: '10px 12px', border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.val}<span style={{ fontSize: 11, color: T.muted, fontWeight: 400 }}> {s.unit}</span></div>
                  <div style={{ fontSize: 10, color: T.muted, marginTop: 2, lineHeight: 1.3 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map((h, i) => (
                <div key={h.id} onClick={() => setSelected(selected === h.id ? null : h.id)}
                  style={{ background: T.surface2, borderRadius: 16, border: `1px solid ${selected === h.id ? T.teal + '40' : T.border}`,
                    overflow: 'hidden', cursor: 'pointer',
                    transition: 'border-color .2s ease',
                    animation: `fadeUp .3s ${i * 0.06}s ease both` }}>
                  <div style={{ padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                      background: h.role === 'driver' ? T.amberDim : T.tealDim,
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 18 }}>{h.role === 'driver' ? '🚗' : '🧑‍✈️'}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: h.role === 'driver' ? T.amber : T.teal,
                          padding: '2px 7px', borderRadius: 6,
                          background: h.role === 'driver' ? T.amberDim : T.tealDim }}>
                          {h.role === 'driver' ? t('common.driver') : t('common.passenger')}
                        </div>
                        <div style={{ fontSize: 11, color: T.muted }}>
                          {h.date.toLocaleDateString('uz', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ color: T.muted }}>📍</span> {h.from}
                      </div>
                      <div style={{ fontSize: 12, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ color: T.red, opacity: .7 }}>🏁</span> {h.to}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{h.duration}</div>
                      <div style={{ fontSize: 11, color: T.muted }}>{h.km} km</div>
                      <div style={{ fontSize: 11, color: T.amber }}>{'★'.repeat(h.rating)}</div>
                    </div>
                  </div>
                  {selected === h.id && (
                    <div style={{ padding: '0 14px 12px', borderTop: `1px solid ${T.border}`,
                      animation: 'fadeUp .2s ease both' }}>
                      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 8,
                            background: T.surface, border: `1px solid ${T.border}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: T.teal }}>
                            {h.partner.split(' ').map((w) => w[0]).join('')}
                          </div>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{h.partner}</div>
                            <div style={{ fontSize: 10, color: T.muted }}>{t('history.partner')}</div>
                          </div>
                        </div>
                        <button style={{ fontSize: 11, padding: '5px 12px', borderRadius: 8,
                          border: `1px solid ${T.teal}40`, background: T.tealDim,
                          color: T.teal, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
                          {t('history.repeat')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )
      )}
    </div>
  );
}
