import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { TASHKENT } from '@/constants/map';
import { TIME_PRESETS } from '@/constants/app';
import { isoDaysFromToday, fmtDayTime } from '@/utils/datetime';
import { haversineKm } from '@/utils/geo';
import { errorMessage } from '@/utils/errors';
import { personIdOf } from '@/utils/ids';
import { useWalkers } from '@/hooks/useWalkers';
import { useAsync } from '@/hooks/useAsync';
import { useStoreEvent } from '@/hooks/useStoreEvent';
import { BLOCK_EVENT, blockStore } from '@/services/blockStore';
import { matchWalkers, nearestWalkers } from '@/services/walkerService';
import { confirmAction } from '@/services/confirm';
import { tripApi } from '@/api/tripApi';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/StatusStates';
import { LocationField } from '@/components/form/LocationField';
import { WalkerCard } from '@/features/matching/WalkerCard';
import type { LatLng, MapTask, PartyType, Place, Walker } from '@/models';

type WalkerFilterType = 'all' | 'driver' | 'passenger';
type DayFilter = 'any' | 0 | 1 | 2;

interface SchedulePanelProps {
  mode: PartyType;
  userLoc: LatLng | null;
  onMapTask: (task: MapTask) => void;
  onTripCreated?: (tripId: unknown) => void;
  /** The viewer already published a trip / is live (spec §17): their own
      trip is shown on top instead of the board being switched off. */
  engaged: boolean;
  /** Open the one "create a trip" sheet. */
  onCreate: () => void;
  /** Open My trips (manage the published trip). */
  onOpenMyTrips: () => void;
}

interface OwnTrip { id: string; origin?: { address?: string }; destination?: { address?: string }; departureTimeUtc: string; category: string }

/** A tappable filter chip. */
function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={on} style={{ flexShrink: 0, minHeight: 38, padding: '0 14px', borderRadius: 19,
      border: `1.5px solid ${on ? T.teal : T.border}`, background: on ? T.tealDim : T.surface2,
      color: on ? T.teal : T.text, fontSize: 13, fontWeight: on ? 700 : 500, cursor: 'pointer',
      fontFamily: 'DM Sans,sans-serif', whiteSpace: 'nowrap' }}>{children}</button>
  );
}

/** Planned trips board: results first, filters as one row of chips (day,
    time of day, who, route). The viewer's own open trip sits on top. */
export function SchedulePanel({ mode, userLoc, onMapTask, engaged, onCreate, onOpenMyTrips }: SchedulePanelProps) {
  const { walkers: loaded, loading, error, reload } = useWalkers(mode);
  // The server leaves blocked people out; this also hides someone blocked
  // after the list loaded. A board row is a trip — test its owner.
  const blocked = useStoreEvent(BLOCK_EVENT, blockStore.list);
  const walkers = loaded.filter((w: Walker) => !blocked.includes(personIdOf(w)));
  const [type, setType] = useState<WalkerFilterType>('all');
  const [day, setDay] = useState<DayFilter>('any');
  const [slot, setSlot] = useState<string | null>(null);
  const [routeOpen, setRouteOpen] = useState(false);
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);

  const mineLoader = useCallback(() => (engaged ? tripApi.mine() as Promise<OwnTrip[]> : Promise.resolve([] as OwnTrip[])), [engaged]);
  const mine = useAsync<OwnTrip[]>(mineLoader, [engaged], []);
  const own = (mine.data || [])[0] || null;
  const [ownBusy, setOwnBusy] = useState(false);
  const [ownError, setOwnError] = useState<string | null>(null);

  const center = userLoc || TASHKENT;
  const preset = TIME_PRESETS.find((p) => p.id === slot) || null;
  const filtered = type !== 'all' || day !== 'any' || !!preset || !!from || !!to;
  const list = filtered
    ? matchWalkers(walkers, {
      type, from, to, date: day === 'any' ? '' : isoDaysFromToday(day),
      tStart: preset ? preset.s : 0, tEnd: preset ? preset.e : 24,
    }, center)
    : nearestWalkers(walkers, center, 12);

  const reset = () => { setType('all'); setDay('any'); setSlot(null); setFrom(null); setTo(null); };
  const openPick = (which: 'from' | 'to', cur: Place | null) => onMapTask({
    type: 'pick', label: which === 'from' ? t('pickField.from') : t('pickField.to'),
    current: cur ? cur.latlng : null, onDone: (p) => (which === 'from' ? setFrom(p) : setTo(p)),
  });

  const cancelOwn = async () => {
    if (!own) return;
    const ok = await confirmAction({ title: t('myTrips.cancelConfirmTitle'), body: t('myTrips.cancelConfirmBody'),
      confirmLabel: t('myTrips.cancel'), cancelLabel: t('common.close'), danger: true });
    if (!ok) return;
    setOwnBusy(true); setOwnError(null);
    try { await tripApi.cancel(own.id); mine.reload(); } catch (e) { setOwnError(errorMessage(e)); } finally { setOwnBusy(false); }
  };

  const roleLabel = mode === 'driver' ? t('common.passenger') : t('common.driver');
  const dayChips: Array<{ id: DayFilter; label: string }> = [
    { id: 'any', label: t('search.anyDay') }, { id: 0, label: t('form.today') },
    { id: 1, label: t('form.tomorrow') }, { id: 2, label: t('form.dayAfter') },
  ];
  const slotLabel: Record<string, string> = { morning: t('form.presetMorning'), noon: t('form.presetNoon'), evening: t('form.presetEvening') };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flexShrink: 0, padding: '12px 16px 10px', borderBottom: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {engaged && own && (
          <div style={{ padding: '12px 14px', borderRadius: 15, background: T.tealDim, border: `1px solid ${T.teal}45`, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.teal, textTransform: 'uppercase', letterSpacing: .5 }}>{t('search.yourTrip')}</div>
            <div style={{ fontSize: 14, color: T.text, lineHeight: 1.4 }}>
              <b>{fmtDayTime(new Date(own.departureTimeUtc))}</b> · {own.origin?.address || '—'} → {own.destination?.address || '—'}
            </div>
            {ownError && <div role="alert" style={{ fontSize: 12.5, color: T.red }}>{ownError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onOpenMyTrips} style={{ flex: 1, minHeight: 44, borderRadius: 12, border: `1px solid ${T.teal}55`,
                background: 'transparent', color: T.teal, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{t('search.manage')}</button>
              {own.category.toLowerCase() !== 'live' && (
                <button onClick={cancelOwn} disabled={ownBusy} style={{ flex: 1, minHeight: 44, borderRadius: 12, border: `1px solid ${T.red}55`,
                  background: `${T.red}12`, color: T.red, fontSize: 13.5, fontWeight: 700, cursor: ownBusy ? 'progress' : 'pointer',
                  fontFamily: 'DM Sans,sans-serif' }}>{ownBusy ? t('common.sending') : t('myTrips.cancel')}</button>
              )}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {dayChips.map((c) => <FilterChip key={String(c.id)} on={day === c.id} onClick={() => setDay(c.id)}>{c.label}</FilterChip>)}
        </div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {TIME_PRESETS.map((p) => <FilterChip key={p.id} on={slot === p.id} onClick={() => setSlot(slot === p.id ? null : p.id)}>{slotLabel[p.id]}</FilterChip>)}
          <FilterChip on={type === 'driver'} onClick={() => setType(type === 'driver' ? 'all' : 'driver')}>🚗 {t('schedule.typeDriver')}</FilterChip>
          <FilterChip on={type === 'passenger'} onClick={() => setType(type === 'passenger' ? 'all' : 'passenger')}>🧍 {t('schedule.typePassenger')}</FilterChip>
          <FilterChip on={routeOpen || !!from || !!to} onClick={() => setRouteOpen((o) => !o)}>{t('search.route')} {routeOpen ? '▴' : '▾'}</FilterChip>
        </div>
        {routeOpen && (
          <div style={{ animation: 'fadeUp .2s ease both' }}>
            <LocationField label={t('form.from')} point={from} accent={T.teal} placeholder={t('form.addrPlaceholder')}
              onSelect={setFrom} onPick={() => openPick('from', from)} />
            <LocationField label={t('form.to')} point={to} accent={T.red} placeholder={t('form.addrPlaceholder')}
              onSelect={setTo} onPick={() => openPick('to', to)} />
          </div>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: .6 }}>
            {filtered ? t('schedule.resultsCount', { n: list.length }) : t('search.nearestOf', { role: roleLabel })}
          </span>
          {filtered && (
            <button onClick={reset} style={{ minHeight: 32, padding: '0 10px', borderRadius: 9, border: `1px solid ${T.border}`,
              background: 'transparent', color: T.muted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{t('common.clear')}</button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? <Spinner label={null} /> : error ? <ErrorState error={error} onRetry={reload} /> : list.length === 0 ? (
            <div style={{ padding: '26px 12px', textAlign: 'center', color: T.muted, fontSize: 14, lineHeight: 1.6 }}>
              {t('schedule.noResults')}<br />{t('schedule.noResultsSub')}
            </div>
          ) : list.map((w, i) => (
            <WalkerCard key={w.id} walker={w} idx={i} dist={haversineKm(center, w.fromLatlng)}
              onSelect={() => onMapTask({ type: 'preview', walker: w })} />
          ))}
        </div>
        {!engaged && (
          <button onClick={onCreate} style={{ width: '100%', minHeight: 48, marginTop: 14, borderRadius: 13,
            border: `1px dashed ${T.teal}60`, background: T.tealDim, color: T.teal, fontSize: 14, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>+ {t('search.addOwn')}</button>
        )}
      </div>
    </div>
  );
}
