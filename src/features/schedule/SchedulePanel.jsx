import { useState } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { TASHKENT } from '@/constants/map';
import { NOW } from '@/utils/datetime';
import { haversineKm } from '@/utils/geo';
import { useWalkers } from '@/hooks/useWalkers';
import { matchWalkers, nearestWalkers, submitTrip } from '@/services/walkerService';
import { Segmented } from '@/components/ui/Segmented';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Spinner } from '@/components/ui/Spinner';
import { LocationField } from '@/components/form/LocationField';
import { WhenField } from '@/components/form/WhenField';
import { SeatsField } from '@/components/form/SeatsField';
import { NotesField } from '@/components/form/NotesField';
import { FIELD_LABEL } from '@/components/form/fieldStyles';
import { WalkerCard } from '@/features/matching/WalkerCard';

/** Search/filter scheduled walkers, or add the user's own trip. */
export function SchedulePanel({ mode, userLoc, onMapTask }) {
  const { walkers, loading } = useWalkers();
  const [tab, setTab] = useState('search'); // 'search' | 'add'

  const EMPTY = { type: 'all', from: null, to: null, date: '', tStart: 6, tEnd: 23, seats: 'any' };
  const [filters, setFilters] = useState(EMPTY);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState([]);

  const todayIso = new Date(NOW).toISOString().slice(0, 10);
  const [form, setForm] = useState({
    type: mode === 'driver' ? 'driver' : 'passenger',
    from: null, to: null, date: todayIso, tStart: 8, tEnd: 10, seats: '1', note: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const center = userLoc || TASHKENT;
  const nearest = nearestWalkers(walkers, center, 10);

  const runSearch = () => { setResults(matchWalkers(walkers, filters, center)); setSearched(true); };
  const resetSearch = () => { setFilters(EMPTY); setSearched(false); setResults([]); };
  const list = searched ? results : nearest;

  const openPick = (slot, target, cur) => onMapTask({
    type: 'pick',
    label: slot === 'from' ? t('pickField.from') : t('pickField.to'),
    current: cur ? cur.latlng : null,
    onDone: (point) => (target === 'filter'
      ? setFilters((f) => ({ ...f, [slot]: point }))
      : setForm((f) => ({ ...f, [slot]: point }))),
  });

  const doSubmit = async () => { await submitTrip(form); setSubmitted(true); };

  const addValid = form.from && form.to && form.date;
  const walkerLabel = mode === 'driver' ? t('common.passenger') : t('common.driver');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 0, margin: '12px 16px 0', background: T.bg,
        borderRadius: 12, padding: 3, border: `1px solid ${T.border}`, flexShrink: 0 }}>
        {[{ id: 'search', label: t('schedule.tabSearch', { role: walkerLabel }) }, { id: 'add', label: t('schedule.tabAdd') }].map((tb) => (
          <button key={tb.id} onClick={() => setTab(tb.id)} style={{
            flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: tab === tb.id ? T.teal : 'transparent', color: tab === tb.id ? 'white' : T.muted,
            fontSize: 12, fontWeight: tab === tb.id ? 600 : 400, transition: 'all .2s ease',
            fontFamily: 'DM Sans,sans-serif' }}>{tb.label}</button>
        ))}
      </div>

      {/* ── SEARCH TAB ── */}
      {tab === 'search' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flexShrink: 0, padding: '14px 16px 12px', overflowY: 'auto', maxHeight: '320px',
            borderBottom: `1px solid ${T.border}` }}>
            <div style={{ marginBottom: 6 }}>
              <div style={FIELD_LABEL}>{t('schedule.walkerType')}</div>
              <div style={{ marginBottom: 14 }}>
                <Segmented value={filters.type} onChange={(v) => setFilters((f) => ({ ...f, type: v }))}
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
              {filters.type === 'driver' && (
                <SeatsField includeAny value={filters.seats} onChange={(v) => setFilters((f) => ({ ...f, seats: v }))} />
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 4, marginBottom: 14 }}>
                {searched && (
                  <button onClick={resetSearch} style={{ padding: '13px 16px', borderRadius: 13,
                    border: `1px solid ${T.border}`, background: 'transparent', color: T.muted,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
                    {t('common.clear')}
                  </button>
                )}
                <button onClick={runSearch} style={{ flex: 1, padding: '13px', borderRadius: 13, border: 'none',
                  background: `linear-gradient(135deg,${T.teal},#0e9e97)`, color: 'white',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
                  boxShadow: `0 4px 18px ${T.tealGlow}`, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8 }}>
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
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
              <span style={{ fontSize: 17, color: T.teal, lineHeight: 1 }}>+</span>
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
              {loading ? <Spinner /> : list.length === 0 ? (
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
          {submitted ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '40px 20px', gap: 14, textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: 20, background: T.tealDim,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>✅</div>
              <div style={{ fontSize: 17, fontWeight: 600, color: T.text }}>{t('schedule.addedTitle')}</div>
              <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
                {t('schedule.addedBody')}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => { setSubmitted(false); setTab('search'); }}
                  style={{ padding: '11px 18px', borderRadius: 12, border: `1px solid ${T.border}`,
                    background: 'transparent', color: T.muted, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
                  {t('schedule.toList')}
                </button>
                <button onClick={() => setSubmitted(false)}
                  style={{ padding: '11px 22px', borderRadius: 12, border: `1px solid ${T.teal}40`,
                    background: T.tealDim, color: T.teal, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
                  {t('schedule.addMore')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 14 }}>
                <div style={FIELD_LABEL}>{t('schedule.iAm')}</div>
                <Segmented value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v }))}
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
                tStart={form.tStart} tEnd={form.tEnd}
                onTime={(s, e) => setForm((f) => ({ ...f, tStart: s, tEnd: e }))} />
              {form.type === 'driver' && (
                <SeatsField value={form.seats} onChange={(v) => setForm((f) => ({ ...f, seats: v }))} />
              )}
              <NotesField value={form.note} onChange={(v) => setForm((f) => ({ ...f, note: v }))} />
              <PrimaryButton enabled={addValid} onClick={doSubmit}>{t('schedule.submit')}</PrimaryButton>
            </>
          )}
        </div>
      )}
    </div>
  );
}
