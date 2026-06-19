import { T } from '@/constants/theme';
import { t } from '@/i18n';

/** Generic empty/placeholder state with an icon, title and "coming soon" pill. */
export function EmptyState({ icon, title, sub }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '48px 32px', gap: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 44, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 17, fontWeight: 600, color: T.text }}>{title}</div>
      <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5 }}>{sub}</div>
      <div style={{ marginTop: 8, fontSize: 12, color: T.muted, padding: '6px 16px',
        borderRadius: 20, border: `1px solid ${T.border}` }}>{t('common.comingSoon')}</div>
    </div>
  );
}
