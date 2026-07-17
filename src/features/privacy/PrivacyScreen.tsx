import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { PRIVACY_SECTION_ICONS } from '@/constants/app';
import { FullScreenPanel } from '@/components/ui/FullScreenPanel';

/** Static privacy-policy screen (sections resolved from i18n). */
export function PrivacyScreen({ onClose }: { onClose: () => void }) {
  return (
    <FullScreenPanel title={t('privacy.title')} accent={T.purple} onClose={onClose}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 32px' }}>
        <div style={{ background: T.surface2, borderRadius: 16, padding: '16px', border: `1px solid ${T.border}`,
          marginBottom: 20, display: 'flex', gap: 13, alignItems: 'center' }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: `${T.purple}1a`, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 3l7 2.5v5C19 15 16 18.5 12 20 8 18.5 5 15 5 10.5v-5L12 3z" stroke={T.purple} strokeWidth="1.7" strokeLinejoin="round" />
              <path d="M9 12l2 2 4-4.4" stroke={T.purple} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{t('privacy.heroTitle')}</div>
            <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>{t('privacy.updated')}</div>
          </div>
        </div>

        <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.6, marginBottom: 22 }}>
          {t('privacy.intro')}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {PRIVACY_SECTION_ICONS.map((icon, i) => (
            <div key={i} style={{ display: 'flex', gap: 13 }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: T.surface2, flexShrink: 0,
                border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 16 }}>{icon}</div>
              <div style={{ flex: 1, paddingTop: 1 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: T.text, marginBottom: 4 }}>{t('privacy.s' + (i + 1) + 'Title')}</div>
                <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>{t('privacy.s' + (i + 1) + 'Body')}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24, padding: '14px 16px', borderRadius: 14, background: T.surface2,
          border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 4 }}>{t('privacy.questions')}</div>
          <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>
            {t('privacy.contactLine')} <span style={{ color: T.teal }}>privacy@ontheway.uz</span>
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: T.muted, marginTop: 22 }}>
          OnTheWay v1.0.0 · © 2025
        </div>
      </div>
    </FullScreenPanel>
  );
}
