import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { FullScreenPanel } from '@/components/ui/FullScreenPanel';
import { SettingsPanel } from './SettingsPanel';

/** Full-screen wrapper around the settings body (opened from the drawer). */
export function SettingsScreen({ onClose }) {
  return (
    <FullScreenPanel title={t('settings.title')} accent={T.teal} onClose={onClose}>
      <SettingsPanel />
    </FullScreenPanel>
  );
}
