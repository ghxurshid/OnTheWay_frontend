import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { FIELD_LABEL } from './fieldStyles';

interface NotesFieldProps { value: string; onChange: (v: string) => void }

/** Optional free-text note textarea. */
export function NotesField({ value, onChange }: NotesFieldProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={FIELD_LABEL}>{t('form.note')}</div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={t('form.notePlaceholder')} rows={2}
        style={{ width: '100%', padding: '11px 12px', borderRadius: 12, resize: 'none',
          background: T.surface2, border: `1.5px solid ${T.border}`, color: T.text, fontSize: 13,
          outline: 'none', fontFamily: 'DM Sans,sans-serif', lineHeight: 1.5 }} />
    </div>
  );
}
