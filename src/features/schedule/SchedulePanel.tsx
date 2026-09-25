import { useEffect, useRef, useState } from 'react';
import { T, TEAL_GRADIENT } from '@/constants/theme';
import { t } from '@/i18n';
import { TASHKENT } from '@/constants/map';
import { isoDaysFromToday, todayIso } from '@/utils/datetime';
import { haversineKm } from '@/utils/geo';
import { errorMessage, fieldErrors, isConflict } from '@/utils/errors';
import { useWalkers } from '@/hooks/useWalkers';
import { matchWalkers, nearestWalkers, submitTrip } from '@/services/walkerService';
import { Segmented } from '@/components/ui/Segmented';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/StatusStates';
import { LocationField } from '@/components/form/LocationField';
import { WhenField } from '@/components/form/WhenField';
import { SeatsField } from '@/components/form/SeatsField';
import { NotesField } from '@/components/form/NotesField';
import { FIELD_LABEL } from '@/components/form/fieldStyles';
import { WalkerCard } from '@/features/matching/WalkerCard';
import type { LatLng, MapTask, PartyType, Place, Walker } from '@/models';

type WalkerFilterType = 'all' | 'driver' | 'passenger';
interface Filters { type: WalkerFilterType; from: Place | null; to: Place | null; date: string; tStart: number; tEnd: number }
interface AddForm { type: PartyType; from: Place | null; to: Place | null; date: string; tStart: number; tEnd: number; seats: string; note: string }

interface SchedulePanelProps {
  mode: PartyType;
  userLoc: LatLng | null;
  onMapTask: (task: MapTask) => void;
  onTripCreated?: (tripId: unknown) => void;
  /** Close the panel (the success screen's "Close"). */
  onClose: () => void;
  /** Close the panel and open "My trips". */
  onOpenMyTrips: () => void;
}

/** The first whole hour still ahead today (a departure must be in the future). */
const firstFreeHour = (): number => {
  const now = new Date();
  return now.getHours() + 1;
};

/** A sensible default slot: the next free morning hour today, else tomorrow 08:00. */
function defaultSlot(): { date: string; tStart: number; tEnd: number } {
  const start = Math.max(8, firstFreeHour());
  return start <= 21
    ? { date: todayIso(), tStart: start, tEnd: Math.min(23, start + 2) }
    : { date: isoDaysFromToday(1), tStart: 8, tEnd: 10 };
}

/** Search/filter scheduled walkers, or add the user's own trip. */
export function SchedulePanel({ mode, userLoc, onMapTask, onTripCreated, onClose, onOpenMyTrips }: SchedulePanelProps) {
  const { walkers, loading, error, reload } = useWalkers(mode);
  const [tab, setTab] = useState('search'); // 'search' | 'add'

  const EMPTY: Filters = { type: 'all', from: null, to: null, date: '', tStart: 6, tEnd: 23 };
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<Walker[]>([]);

  const [form, setForm] = useState<AddForm>(() => ({
    type: mode === 'driver' ? 'driver' : 'passenger',
    from: null, to: null, seats: '1', note: '', ...defaultSlot(),
  }));
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<unknown>(null);

  // Creating a trip makes the viewer "engaged", which hides this board (spec
  // §17). Report it only when the user leaves the confirmation — never while
  // they are still reading it (or when the panel is closed some other way).
  const createdRef = useRef<unknown>(null);
  const reportCreated = () => {
    if (createdRef.current == null) return;
    const id = createdRef.current;
    createdRef.current = null;
    onTripCreated?.(id);
  };
  useEffect(() => () => reportCreated(), []); // eslint-disable-line react-hooks/exhaustive-deps -- on unmount only

  const center = userLoc || TASHKENT;
  const nearest = nearestWalkers(walkers, center, 10);

  const runSearch = () => { setResults(matchWalkers(walkers, filters, center)); setSearched(true); };
  const resetSearch = () => { setFilters(EMPTY); setSearched(false); setResults([]); };
  const list = searched ? results : nearest;

  const openPick = (slot: 'from' | 'to', target: 'filter' | 'add', cur: Place | null) => onMapTask({
    type: 'pick',
    label: slot === 'from' ? t('pickField.from') : t('pickField.to'),
    current: cur ? cur.latlng : null,
    onDone: (point) => (target === 'filter'
      ? setFilters((f) => ({ ...f, [slot]: point }))
      : setForm((f) => ({ ...f, [slot]: point }))),
  });

  const minHourToday = firstFreeHour();
  const isPast = form.date === todayIso() && form.tStart < minHourToday;
  const addValid = !!(form.from && form.to && form.date) && !isPast;

  // A ref, not `busy`: taps in the same frame all see the stale state.
  const inflightRef = useRef(false);
  const doSubmit = async () => {
    if (inflightRef.current || !form.from || !form.to) return;
    inflightRef.current = true;
    setBusy(true);
    setSubmitError(null);
    try {
      const created = await submitTrip({ ...form, from: form.from, to: form.to });
      createdRef.current = created?.id ?? true;
      setCreatedId(createdRef.current);
    } catch (e) {
      setSubmitError(isConflict(e) ? t('form.duplicate')
        : fieldErrors(e).departuretimeutc ? t('form.pastTime')
          : errorMessage(e, 'errors.sendFailed'));
    } finally {
      inflightRef.current = false;
      setBusy(false);
    }
  };

  const walkerLabel = mode === 'driver' ? t('common.passenger') : t('common.driver');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {/* Sub-tabs */}
      <Segmented value={tab} onChange={setTab} pad={9} style={{ margin: '12px 16px 0', flexShrink: 0 }}
        options={[{ id: 'search', label: t('schedule.tabSearch', { role: walkerLabel }) }, { id: 'add', label: t('schedule.tabAdd') }]} />

      {/* ── SEARCH TAB ── */}
      {tab === 'search' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flexShrink: 0, padding: '14px 16px 12px', overflowY: 'auto', maxHeight: '320px',
            borderBottom: `1px solid ${T.border}` }}>
            <div style={{ marginBottom: 6 }}>
              <div style={FIELD_LABEL}>{t('schedule.walkerType')}</div>
              <div style={{ marginBottom: 14 }}>
                <Segmented value={filters.type} onChange={(v) => setFilters((f) => ({ ...f, type: v as WalkerFilterType }))}
                  options={[{ id: 'all', label: t('schedule.typeAll') }, { id: 'driver', label: '🚗 ' + t('schedule.typeDriver') }, { id: 'passenger', label: '🧑‍✈️ ' + t('schedule.typePassenger') }]} />
              </div>
              <LocationField label={t('form.from')} point={filters.from} accent={T.teal}
                placeholder={t('form.addrPlaceholder')}
                onSelect={(p) => setFilters((f) => ({ ...f, from: p }))}
                onPick={() => openPick('from', 'filter', filters.from)} />
              <LocationField label={t('form.to')} point={filters.to} accent={T.red}
                placeholder={t('form.addrPlaceholder')}
                onSelect={(p) => setFilters((f) => ({ ...f, to: p }))}
                onPick={() => openPick('to', 'filter', filters.to)} />
              <WhenField date={filters.date} onDate={(v) => setFilters((f) => ({ ...f, date: v }))}
                tStart={filters.tStart} tEnd={filters.tEnd}
                onTime={(s, e) => setFilters((f) => ({ ...f, tStart: s, tEnd: e }))} />
              <div style={{ display: 'flex', gap: 8, marginTop: 4, marginBottom: 14 }}>
                {searched && (
                  <button onClick={resetSearch} style={{ padding: '13px 16px', borderRadius: 13,
                    border: `1px solid ${T.border}`, background: 'transparent', color: T.muted,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
                    {t('common.clear')}
                  </button>
                )}
                <button onClick={runSearch} disabled={loading || !!error} style={{ flex: 1, padding: '13px', borderRadius: 13, border: 'none',
                  background: TEAL_GRADIENT, color: 'white',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
                  boxShadow: `0 4px 18px ${T.tealGlow}`, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8 }}>
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="7" cy="7" r="5" stroke="white" strokeWidth="1.8" />
                    <path d="M11 11L14 14" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  {t('schedule.find')}
                </button>
              </div>
            </div>

            <button onClick={() => setTab('add')} style={{ width: '100%', padding: '11px 14px', borderRadius: 12,
              border: `1px dashed ${T.teal}45`, background: T.tealDim, display: 'flex', alignItems: 'center',
              gap: 8, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', marginBottom: 14 }}>
              <span aria-hidden="true" style={{ fontSize: 17, color: T.teal, lineHeight: 1 }}>+</span>
              <span style={{ fontSize: 12, color: T.teal, fontWeight: 600 }}>{t('schedule.addOwnTrip')}</span>
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: .6 }}>
                {searched ? t('schedule.resultsCount', { n: list.length }) : t('schedule.nearest')}
              </span>
              {!searched && <span style={{ fontSize: 10, color: T.muted }}>{t('schedule.byLocation')}</span>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {loading ? <Spinner label={null} /> : error ? <ErrorState error={error} onRetry={reload} /> : list.length === 0 ? (
                <div style={{ padding: '30px 20px', textAlign: 'center', color: T.muted, fontSize: 13, lineHeight: 1.6 }}>
                  {t('schedule.noResults')}<br />{t('schedule.noResultsSub')}
                </div>
              ) : list.map((w, i) => (
                <WalkerCard key={w.id} walker={w} idx={i} dist={haversineKm(center, w.fromLatlng)}
                  onSelect={() => onMapTask({ type: 'preview', walker: w })} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── ADD TRIP TAB ── */}
      {tab === 'add' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 24px' }}>
          {createdId != null ? (
            <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '40px 20px', gap: 14, textAlign: 'center' }}>
              <div aria-hidden="true" style={{ width: 56, height: 56, borderRadius: 20, background: T.tealDim,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>✅</div>
              <div style={{ fontSize: 17, fontWeight: 600, color: T.text }}>{t('schedule.addedTitle')}</div>
              <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
                {t('schedule.addedBody')}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => { reportCreated(); onClose(); }}
                  style={{ padding: '11px 18px', borderRadius: 12, border: `1px solid ${T.border}`,
                    background: 'transparent', color: T.muted, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
                  {t('common.close')}
                </button>
                <button onClick={() => { reportCreated(); onOpenMyTrips(); }}
                  style={{ padding: '11px 22px', borderRadius: 12, border: `1px solid ${T.teal}40`,
                    background: T.tealDim, color: T.teal, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
                  {t('myTrips.title')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 14 }}>
                <div style={FIELD_LABEL}>{t('schedule.iAm')}</div>
                <Segmented value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v as PartyType }))}
                  options={[{ id: 'passenger', label: '🧑‍✈️ ' + t('schedule.iAmPassenger') }, { id: 'driver', label: '🚗 ' + t('schedule.iAmDriver') }]} />
              </div>
              <LocationField label={t('form.from')} point={form.from} accent={T.teal}
                placeholder={t('form.addrPlaceholder')}
                onSelect={(p) => setForm((f) => ({ ...f, from: p }))}
                onPick={() => openPick('from', 'add', form.from)} />
              <LocationField label={t('form.to')} point={form.to} accent={T.red}
                placeholder={t('form.addrPlaceholder')}
                onSelect={(p) => setForm((f) => ({ ...f, to: p }))}
                onPick={() => openPick('to', 'add', form.to)} />
              <WhenField date={form.date} onDate={(v) => setForm((f) => ({ ...f, date: v }))}
                tStart={form.tStart} tEnd={form.tEnd} minHourToday={minHourToday}
                onTime={(s, e) => setForm((f) => ({ ...f, tStart: s, tEnd: e }))} />
              {isPast && (
                <div role="alert" style={{ margin: '-4px 0 12px', fontSize: 12.5, color: T.amber }}>{t('form.pastTime')}</div>
              )}
              {form.type === 'driver' && (
                <SeatsField value={form.seats} onChange={(v) => setForm((f) => ({ ...f, seats: v }))} />
              )}
              <NotesField value={form.note} onChange={(v) => setForm((f) => ({ ...f, note: v }))} />
              {submitError && (
                <div role="alert" style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 12, fontSize: 12.5, lineHeight: 1.45,
                  color: T.red, background: `${T.red}14`, border: `1px solid ${T.red}40` }}>{submitError}</div>
              )}
              <PrimaryButton enabled={addValid} busy={busy} onClick={doSubmit}>{t('schedule.submit')}</PrimaryButton>
            </>
          )}
        </div>
      )}
    </div>
  );
}
