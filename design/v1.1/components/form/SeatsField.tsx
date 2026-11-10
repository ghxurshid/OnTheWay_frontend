import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { FIELD_LABEL } from './fieldStyles';

interface SeatsFieldProps { value: string; onChange: (v: string) => void }

/** Free-seat picker (1..4) for a driver's published trip. */
export function SeatsField({ value, onChange }: SeatsFieldProps) {
  const opts = [1, 2, 3, 4].map((n) => ({ v: String(n), l: String(n) }));
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={FIELD_LABEL}>{t('form.seats')}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {opts.map((o) => {
          const on = value === o.v;
          return (
            <button key={o.v} onClick={() => onChange(o.v)} aria-pressed={on} style={{
              flex: 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer',
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
