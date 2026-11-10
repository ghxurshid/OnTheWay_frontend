import { t } from '@/i18n';
import { currentUserName } from '@/services/authService';
import { telegramUser } from '@/services/telegram';

/** The signed-in user's display name and photo (Telegram first). */
export function useProfileIdentity(): { name: string; photo: string | null; username: string | null } {
  const tg = telegramUser();
  const tgName = [tg?.first_name, tg?.last_name].filter(Boolean).join(' ');
  return { name: currentUserName() || tgName || t('common.user'), photo: tg?.photo_url || null, username: tg?.username || null };
}
