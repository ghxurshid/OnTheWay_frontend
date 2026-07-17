import { useState } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { NOW } from '@/utils/datetime';
import { TIME_PRESETS, UZ_MON, UZ_MON_S, UZ_DOW } from '@/constants/app';
import { FIELD_LABEL } from './fieldStyles';
import { TimeRangeSlider } from './TimeRangeSlider';

interface WhenFieldProps {
  date: string;
  onDate: (iso: string) => void;
  tStart: number;
  tEnd: number;
  onTime: (start: number, end: number) => void;
}

/** Date chooser (today/tomorrow/+2/custom calendar) + time presets + range. */
export function WhenField({ date, onDate, tStart, tEnd, onTime }: WhenFieldProps) {
  const dateOpts = [0, 1, 2].map((i) => {
    const d = new Date(NOW); d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    return { iso, label: i === 0 ? t('form.today') : i === 1 ? t('form.tomorrow') : t('form.dayAfter') };
  });
  const presetIsos = dateOpts.map((d) => d.iso);
  const customActive = date && !presetIsos.includes(date);
  const activePreset = TIME_PRESETS.find((p) => p.s === tStart && p.e === tEnd);

  const todayIso = new Date(NOW).toISOString().slice(0, 10);
  const [calOpen, setCalOpen] = useState(false);
  const initRef = customActive ? new Date(date + 'T00:00') : new Date(NOW);
  const [calYM, setCalYM] = useState({ y: initRef.getFullYear(), m: initRef.getMonth() });
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmtIso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const buildCells = (y: number, m: number): (number | null)[] => {
    const startDow = (new Date(y, m, 1).getDay() + 6) % 7;
    const dim = new Date(y, m + 1, 0).getDate();
    const cells: (number | null)[] = []; for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(d); return cells;
  };
  const shiftMonth = (delta: number) => setCalYM(({ y, m }) => { const nm = m + delta; return { y: y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 }; });
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={FIELD_LABEL}>{t('form.when')}</div>
      <div style={{ display: 'flex', gap: 6, paddingBottom: 8 }}>
        {dateOpts.map((d) => {
          const on = date === d.iso;
          return (
            <button key={d.iso} onClick={() => onDate(d.iso)} style={{
              flex: 1, padding: '8px 0', borderRadius: 12, cursor: 'pointer',
              border: `1px solid ${on ? T.amber + '60' : T.border}`,
              background: on ? 'rgba(240,168,50,0.14)' : 'transparent',
              color: on ? T.amber : T.muted, fontSize: 12, fontWeight: on ? 600 : 400,
              fontFamily: 'DM Sans,sans-serif', whiteSpace: 'nowrap' }}>{d.label}</button>
          );
        })}
        <div style={{ flex: 1, position: 'relative' }}>
          <button onClick={() => {
            if (!calOpen && customActive) { const d = new Date(date + 'T00:00'); setCalYM({ y: d.getFullYear(), m: d.getMonth() }); }
            setCalOpen((o) => !o);
          }} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 5, padding: '8px 0', borderRadius: 12, cursor: 'pointer',
            border: `1px solid ${customActive || calOpen ? T.amber + '60' : T.border}`,
            background: customActive || calOpen ? 'rgba(240,168,50,0.14)' : 'transparent',
            fontFamily: 'DM Sans,sans-serif' }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <rect x="2.5" y="3" width="11" height="11" rx="2" stroke={customActive || calOpen ? T.amber : T.muted} strokeWidth="1.4" />
              <path d="M2.5 6.5h11M5.5 1.8v2.2M10.5 1.8v2.2" stroke={customActive || calOpen ? T.amber : T.muted} strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 12, fontWeight: customActive ? 600 : 400, color: customActive || calOpen ? T.amber : T.muted,
              whiteSpace: 'nowrap' }}>
              {customActive ? (() => { const d = new Date(date + 'T00:00'); return `${d.getDate()}-${UZ_MON_S[d.getMonth()]}`; })() : t('form.other')}
            </span>
          </button>
        </div>
      </div>

      {calOpen && (
        <div style={{ marginBottom: 12,
          background: T.hover, border: `1px solid ${T.border}`, borderRadius: 16,
          padding: '12px 12px 10px', animation: 'fadeUp .16s ease both' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button onClick={() => shiftMonth(-1)} style={{ width: 30, height: 30, borderRadius: 9,
              border: `1px solid ${T.border}`, background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 2L3.5 6l4 4" stroke={T.muted} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{UZ_MON[calYM.m]} {calYM.y}</span>
            <button onClick={() => shiftMonth(1)} style={{ width: 30, height: 30, borderRadius: 9,
              border: `1px solid ${T.border}`, background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2l4 4-4 4" stroke={T.muted} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 5 }}>
            {UZ_DOW.map((w, i) => (
              <div key={w} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600,
                color: i >= 5 ? T.red + '99' : T.muted, padding: '2px 0' }}>{w}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
            {buildCells(calYM.y, calYM.m).map((d, i) => {
              if (d === null) return <div key={'e' + i} />;
              const iso = fmtIso(calYM.y, calYM.m, d);
              const sel = date === iso; const isToday = iso === todayIso; const past = iso < todayIso;
              return (
                <button key={iso} disabled={past} onClick={() => { onDate(iso); setCalOpen(false); }} style={{
                  height: 34, borderRadius: 9, cursor: past ? 'default' : 'pointer',
                  border: isToday && !sel ? `1px solid ${T.amber}66` : '1px solid transparent',
                  background: sel ? T.amber : 'transparent',
                  color: sel ? '#1a1205' : past ? T.muted + '44' : T.text,
                  fontSize: 13, fontWeight: sel ? 700 : isToday ? 600 : 400,
                  fontFamily: 'DM Sans,sans-serif', transition: 'background .12s ease' }}>{d}</button>
              );
            })}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, margin: '2px 0 12px' }}>
        {TIME_PRESETS.map((p) => {
          const on = activePreset && activePreset.id === p.id;
          return (
            <button key={p.id} onClick={() => onTime(p.s, p.e)} style={{
              flex: 1, padding: '7px 0', borderRadius: 9, cursor: 'pointer',
              border: `1px solid ${on ? T.purple + '60' : T.border}`,
              background: on ? 'rgba(167,139,250,0.14)' : 'transparent',
              color: on ? T.purple : T.muted, fontSize: 11, fontWeight: on ? 600 : 400,
              fontFamily: 'DM Sans,sans-serif' }}>{t('form.preset' + p.id.charAt(0).toUpperCase() + p.id.slice(1))}</button>
          );
        })}
      </div>
      <TimeRangeSlider start={tStart} end={tEnd} onChange={onTime} />
    </div>
  );
}
