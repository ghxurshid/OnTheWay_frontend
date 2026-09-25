import { useState } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { useHistory } from '@/hooks/useHistory';
import { historyTotals } from '@/services/historyService';
import { Spinner } from '@/components/ui/Spinner';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState, ErrorState } from '@/components/ui/StatusStates';
import { fmtDate } from '@/utils/datetime';
import { initialsOf } from '@/utils/avatar';
import type { Trip } from '@/models';
import { Dashboard } from './Dashboard';

const durationLabel = (h: Trip): string =>
  h.durationMinutes != null ? t('common.minutes', { n: h.durationMinutes }) : h.duration;
const kmLabel = (h: Trip): string => t('common.km', { n: h.distanceKm != null ? h.distanceKm.toFixed(1) : h.km });

/** Trip history list + dashboard tabs. */
export function HistoryPanel() {
  const { history, loading, error, reload } = useHistory();
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState('history'); // 'history' | 'dashboard'
  const { totalTrips, totalKm, averageRating } = historyTotals(history);

  const TABS = [
    { id: 'history', label: t('history.tabHistory'), icon: '🕒' },
    { id: 'dashboard', label: t('history.tabDashboard'), icon: '📊' },
  ];

  const renderHistory = () => {
    if (loading) return <Spinner label={null} />;
    if (error) return <ErrorState error={error} onRetry={reload} />;
    if (history.length === 0) {
      return <EmptyState icon="🛣️" title={t('history.emptyTitle')} body={t('history.emptyBody')} />;
    }
    return (
      <>
        {/* Stats row */}
        <div style={{ display: 'flex', gap: 10, padding: '12px 16px 10px', flexShrink: 0 }}>
          {[
            { label: t('history.statTrips'), val: totalTrips, unit: t('history.unitTrips'), color: T.teal },
            { label: t('history.statDistance'), val: totalKm, unit: 'km', color: T.amber },
            { label: t('history.yourRating'), val: averageRating ?? '—', unit: averageRating ? '⭐' : '', color: T.purple },
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
          {history.map((h, i) => {
            const open = selected === h.id;
            return (
              <div key={h.id} style={{ background: T.surface2, borderRadius: 16,
                border: `1px solid ${open ? T.teal + '40' : T.border}`, overflow: 'hidden',
                transition: 'border-color .2s ease', animation: `fadeUp .3s ${Math.min(i, 8) * 0.06}s ease both` }}>
                <button onClick={() => setSelected(open ? null : h.id)} aria-expanded={open}
                  style={{ width: '100%', padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center',
                    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'DM Sans,sans-serif' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    background: h.role === 'driver' ? T.amberDim : T.tealDim,
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span aria-hidden="true" style={{ fontSize: 18 }}>{h.role === 'driver' ? '🚗' : '🧑‍✈️'}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: h.role === 'driver' ? T.amber : T.teal,
                        padding: '2px 7px', borderRadius: 6,
                        background: h.role === 'driver' ? T.amberDim : T.tealDim }}>
                        {h.role === 'driver' ? t('common.driver') : t('common.passenger')}
                      </div>
                      <div style={{ fontSize: 11, color: T.muted }}>{fmtDate(h.date)}</div>
                      {h.status === 'cancelled' && <div style={{ fontSize: 11, color: T.red }}>{t('history.cancelled')}</div>}
                    </div>
                    <div style={{ fontSize: 12, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span aria-hidden="true" style={{ color: T.muted }}>📍</span> {h.from}
                    </div>
                    <div style={{ fontSize: 12, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span aria-hidden="true" style={{ color: T.red, opacity: .7 }}>🏁</span> {h.to}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{durationLabel(h)}</div>
                    <div style={{ fontSize: 11, color: T.muted }}>{kmLabel(h)}</div>
                    {h.rating ? <div style={{ fontSize: 11, color: T.amber }} aria-label={`${h.rating} ★`}>{'★'.repeat(Math.max(0, Math.min(5, h.rating)))}</div> : null}
                  </div>
                </button>
                {open && (
                  <div style={{ padding: '0 14px 12px', borderTop: `1px solid ${T.border}`,
                    animation: 'fadeUp .2s ease both' }}>
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8,
                        background: T.surface, border: `1px solid ${T.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: T.teal }}>
                        {h.partner ? initialsOf(h.partner) : '—'}
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{h.partner || t('history.noPartner')}</div>
                        <div style={{ fontSize: 10, color: T.muted }}>{t('history.partner')}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sub-tabs */}
      <Segmented options={TABS} value={tab} onChange={setTab} pad={9} style={{ margin: '12px 16px 0', flexShrink: 0 }} />

      {tab === 'dashboard' && (
        <div style={{ flex: 1, overflowY: 'auto' }}><Dashboard /></div>
      )}

      {tab === 'history' && renderHistory()}
    </div>
  );
}
