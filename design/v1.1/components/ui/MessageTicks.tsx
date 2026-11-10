import { t } from '@/i18n';
import type { MessageStatus } from '@/services/messageStatus';

type TickStatus = Exclude<MessageStatus, 'failed'>;

// Literal keys (not built from the status) so the i18n key test covers them.
const LABELS: Record<TickStatus, () => string> = {
  pending: () => t('chat.pending'),
  sent: () => t('chat.statusSent'),
  delivered: () => t('chat.statusDelivered'),
  read: () => t('chat.statusRead'),
};

interface MessageTicksProps {
  status: TickStatus;
  /** Colour of the clock / ✓ / delivered ✓✓. */
  color: string;
  /** Colour of the read ✓✓ — it must stand apart from `color`. */
  readColor: string;
}

/** Receipt mark of an outgoing message, as messengers draw it:
    🕓 sending · ✓ sent · ✓✓ delivered · ✓✓ read (in `readColor`). */
export function MessageTicks({ status, color, readColor }: MessageTicksProps) {
  const label = LABELS[status]();
  return (
    <svg role="img" aria-label={label} width="16" height="11" viewBox="0 0 16 11" fill="none"
      stroke={status === 'read' ? readColor : color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'block' }}>
      <title>{label}</title>
      {status === 'pending' ? (
        <>
          <circle cx="8" cy="5.5" r="4.2" />
          <path d="M8 3.3 V5.5 L9.6 6.6" />
        </>
      ) : (
        <>
          <path d="M1.2 5.8 L4.2 8.8 L10.2 2.2" />
          {status !== 'sent' && <path d="M7.4 8.2 L8 8.8 L14 2.2" />}
        </>
      )}
    </svg>
  );
}
