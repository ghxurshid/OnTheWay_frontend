import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { useDashboard } from '@/hooks/useDashboard';
import { useHistory } from '@/hooks/useHistory';
import { weeklyMetrics } from '@/services/dashboardService';
import { roleSplit } from '@/services/historyService';
import { Spinner } from '@/components/ui/Spinner';

const DAYS = ['Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha', 'Yak'];

/** Analytics dashboard: weekly chart, top destinations, role split. */
export function Dashboard() {
  const { summary, loading } = useDashboard();
  const { history } = useHistory();

  if (loading || !summary) return <Spinner />;

  const weekly = summary.weekly;
  const destinations = summary.destinations;
  const max = Math.max(...weekly);
  const maxCount = destinations[0].count;
  const { totalWeek, activeDays, co2Saved, moneySaved } = weeklyMetrics(weekly);
  const { driverTrips, passTrips, driverPct } = roleSplit(history);
  const todayIdx = (new Date().getDay() + 6) % 7;

  return (
    <div style={{ padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero */}
      <div style={{ background: `linear-gradient(135deg,${T.teal}22,${T.teal}08)`,
        borderRadius: 18, padding: '16px 18px',
        border: `1px solid ${T.teal}30`, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: 70,
          background: `radial-gradient(circle,${T.teal}25 0%,transparent 70%)`, pointerEvents: 'none' }} />
        <div style={{ fontSize: 11, color: T.teal, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: .6, marginBottom: 4 }}>{t('dashboard.thisWeek')}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, position: 'relative' }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: T.text, letterSpacing: -1, lineHeight: 1 }}>{totalWeek}</div>
          <div style={{ fontSize: 13, color: T.muted }}>{t('dashboard.tripsCount', { n: activeDays })}</div>
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 12, position: 'relative' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.green }}>−{co2Saved} kg</div>
            <div style={{ fontSize: 10, color: T.muted }}>{t('dashboard.co2')}</div>
          </div>
          <div style={{ width: 1, background: T.border }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.amber }}>{moneySaved.toLocaleString()} {t('dashboard.som')}</div>
            <div style={{ fontSize: 10, color: T.muted }}>{t('dashboard.moneySaved')}</div>
          </div>
        </div>
      </div>

      {/* Weekly chart */}
      <div style={{ background: T.surface2, borderRadius: 16, padding: '14px', border: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{t('dashboard.weeklyActivity')}</div>
          <div style={{ fontSize: 10, color: T.muted }}>{t('dashboard.kmPerDay')}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          gap: 5, height: 96, paddingTop: 14 }}>
          {weekly.map((v, i) => {
            const h = (v / max) * 100;
            const isToday = i === todayIdx;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', width: '100%', position: 'relative' }}>
                  <div style={{ width: '100%', height: `${h}%`,
                    background: isToday
                      ? `linear-gradient(to top,${T.teal},#0e9e97)`
                      : `linear-gradient(to top,${T.teal}66,${T.teal}22)`,
                    borderRadius: '5px 5px 2px 2px',
                    boxShadow: isToday ? `0 0 12px ${T.tealGlow}` : 'none',
                    animation: `fadeUp .5s ${i * .07}s ease both`,
                    minHeight: 4, position: 'relative' }}>
                    {isToday && (
                      <div style={{ position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)',
                        fontSize: 9, fontWeight: 700, color: T.teal, whiteSpace: 'nowrap' }}>{v}</div>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: isToday ? T.teal : T.muted,
                  fontWeight: isToday ? 700 : 400 }}>{DAYS[i]}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top destinations */}
      <div style={{ background: T.surface2, borderRadius: 16, padding: '14px', border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 12 }}>
          {t('dashboard.topDest')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {destinations.map((d, i) => (
            <div key={d.label} style={{ animation: `fadeUp .3s ${i * .06}s ease both` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6,
                    background: i === 0 ? T.tealDim : T.bg,
                    color: i === 0 ? T.teal : T.muted, fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  <span style={{ fontSize: 12, color: T.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
                </div>
                <span style={{ fontSize: 10, color: T.muted, whiteSpace: 'nowrap' }}>{d.count}× · {d.km}km</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: T.bg, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(d.count / maxCount) * 100}%`,
                  background: i === 0 ? `linear-gradient(to right,${T.teal},#0e9e97)` : `${T.muted}40`,
                  borderRadius: 2, transition: 'width .6s ease' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Role split */}
      <div style={{ background: T.surface2, borderRadius: 16, padding: '14px', border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 10 }}>
          {t('dashboard.roleSplit')}
        </div>
        <div style={{ display: 'flex', height: 32, borderRadius: 10, overflow: 'hidden',
          border: `1px solid ${T.border}` }}>
          <div style={{ width: `${driverPct}%`,
            background: `linear-gradient(135deg,${T.amber},${T.amber}aa)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600, color: 'white', minWidth: 60 }}>
            🚗 {driverPct}%
          </div>
          <div style={{ flex: 1,
            background: `linear-gradient(135deg,${T.teal},#0e9e97)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600, color: 'white' }}>
            🧑‍✈️ {100 - driverPct}%
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: T.muted }}>
          <span>{t('dashboard.asDriver', { n: driverTrips })}</span>
          <span>{t('dashboard.asPassenger', { n: passTrips })}</span>
        </div>
      </div>
    </div>
  );
}
