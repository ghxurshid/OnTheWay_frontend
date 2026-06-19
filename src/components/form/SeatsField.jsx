import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { FIELD_LABEL } from './fieldStyles';

/** Seat-count picker (1..4, with optional "any"). */
export function SeatsField({ value, onChange, includeAny = false }) {
  const opts = [...(includeAny ? [{ v: 'any', l: t('form.seatsAny') }] : []), ...[1, 2, 3, 4].map((n) => ({ v: String(n), l: String(n) }))];
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={FIELD_LABEL}>{t('form.seats')}{includeAny ? t('form.seatsMin') : ''}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {opts.map((o) => {
          const on = value === o.v;
          return (
            <button key={o.v} onClick={() => onChange(o.v)} style={{
              flex: o.v === 'any' ? 1.7 : 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer',
              border: `1.5px solid ${on ? T.teal + '60' : T.border}`,
              background: on ? T.tealDim : T.bg, color: on ? T.teal : T.muted,
              fontSize: 13, fontWeight: 600, fontFamily: 'DM Sans,sans-serif', transition: 'all .15s ease' }}>
              {o.l}
            </button>
          );
        })}
      </div>
    </div>
  );
}
