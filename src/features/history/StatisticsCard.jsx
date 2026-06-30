import { useState, useEffect } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { dashboardApi } from '@/api/dashboardApi';

// Reporting periods offered in the selector (a subset of the backend's set).
const PERIODS = ['Today', 'ThisWeek', 'ThisMonth', 'AllTime'];

/** Full backend statistics for a reporting period: measured totals plus the
    backend's clearly-labelled estimated savings (spec §52). */
export function StatisticsCard() {
  const [period, setPeriod] = useState('ThisMonth');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    dashboardApi.getStatistics(period)
      .then((s) => { if (alive) setStats(s); })
      .catch(() => { if (alive) setStats(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [period]);

  return (
    <div style={{ background: T.surface2, borderRadius: 16, padding: '14px', border: `1px solid ${T.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{t('dashboard.statistics')}</div>
      </div>

      {/* Period selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {PERIODS.map((p) => {
          const act = period === p;
          return (
            <button key={p} onClick={() => setPeriod(p)}
              style={{ flex: 1, padding: '7px 0', borderRadius: 9,
                border: `1.5px solid ${act ? T.teal + '60' : T.border}`,
                background: act ? T.tealDim : 'transparent', color: act ? T.teal : T.muted,
                fontSize: 11, fontWeight: act ? 600 : 400, cursor: 'pointer',
                fontFamily: 'DM Sans,sans-serif', transition: 'all .15s ease' }}>
              {t('dashboard.period' + p)}
            </button>
          );
        })}
      </div>

      {loading || !stats ? (
        <div style={{ fontSize: 12, color: T.muted, textAlign: 'center', padding: '18px 0' }}>
          {loading ? t('common.loading') : t('dashboard.noData')}
        </div>
      ) : (
        <>
          {/* Measured metrics grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Metric label={t('dashboard.totalTrips')} value={stats.totalCompletedTrips} />
            <Metric label={t('dashboard.totalDistance')} value={`${Math.round(stats.totalDistanceKm)} km`} />
            <Metric label={t('common.driver')} value={stats.driverTrips} />
            <Metric label={t('common.passenger')} value={stats.passengerTrips} />
            <Metric label={t('dashboard.passengersCarried')} value={stats.totalPassengersTransported} />
            <Metric label={t('dashboard.occupancy')}
              value={`${Math.round((stats.averageVehicleOccupancy || 0) * 100)}%`} />
          </div>

          {/* Estimated savings — clearly marked as estimates (spec §52) */}
          <div style={{ marginTop: 12, padding: '12px', borderRadius: 12,
            background: `linear-gradient(135deg,${T.teal}18,${T.teal}06)`, border: `1px solid ${T.teal}30` }}>
            <div style={{ fontSize: 10.5, color: T.teal, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: .5, marginBottom: 8 }}>{t('dashboard.estimatedSavings')}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <SavingsStat color={T.green} value={`${stats.estimated.fuelSavedLiters.toFixed(1)} L`} label={t('dashboard.fuel')} />
              <SavingsStat color={T.teal} value={`${stats.estimated.co2ReducedKg.toFixed(1)} kg`} label={t('dashboard.co2')} />
              <SavingsStat color={T.amber} value={`${Math.round(stats.estimated.costSaved).toLocaleString()}`} label={t('dashboard.som')} />
            </div>
            <div style={{ fontSize: 10, color: T.muted, marginTop: 8, fontStyle: 'italic' }}>
              {t('dashboard.estimateNote')}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div style={{ background: T.bg, borderRadius: 11, padding: '10px 12px', border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 19, fontWeight: 700, color: T.text, letterSpacing: -.4, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function SavingsStat({ color, value, label }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 14.5, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 9.5, color: T.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
}
