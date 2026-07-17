import { T } from '@/constants/theme';
import { t } from '@/i18n';
import type { Booking } from '@/services/bookingStore';

interface BookingRequestPromptProps {
  booking: Booking | null;
  busy: boolean;
  onAccept: (b: Booking) => void;
  onReject: (b: Booking) => void;
}

/** Modal shown to a driver when a passenger requests to join their trip.
 *  The driver accepts (reserves the seats) or rejects. */
export function BookingRequestPrompt({ booking, busy, onAccept, onReject }: BookingRequestPromptProps) {
  if (!booking) return null;
  const seats = (booking.seatsBooked as number) || 1;
  const message = booking.message as string | undefined;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
      background: 'rgba(0,0,0,.55)', pointerEvents: 'auto' }}>
      <div style={{ width: '100%', maxWidth: 340, background: T.glassSolid, backdropFilter: 'blur(24px)',
        borderRadius: 22, border: `1px solid ${T.amber}45`, boxShadow: '0 20px 60px rgba(0,0,0,.6)',
        padding: '22px 20px 18px', animation: 'fadeUp .25s ease both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 15, background: `${T.amber}22`,
            border: `1.5px solid ${T.amber}55`, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>🤝</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{t('booking.requestedTitle')}</div>
            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>{t('booking.requestedBody')}</div>
          </div>
        </div>

        <div style={{ background: T.bg, borderRadius: 12, padding: '10px 12px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>
            🪑 {seats} {t('common.seats')}
          </span>
          {message && (
            <span style={{ fontSize: 12, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' }}>· {message}</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => onReject(booking)} disabled={busy} style={{ flex: 1, padding: '13px',
            borderRadius: 13, border: `1px solid ${T.red}40`, background: 'rgba(255,92,114,0.08)',
            color: T.red, fontSize: 14, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.6 : 1, fontFamily: 'DM Sans,sans-serif' }}>{t('booking.reject')}</button>
          <button onClick={() => onAccept(booking)} disabled={busy} style={{ flex: 1.4, padding: '13px',
            borderRadius: 13, border: 'none', background: `linear-gradient(135deg,${T.teal},#0e9e97)`,
            color: 'white', fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.7 : 1, boxShadow: `0 4px 16px ${T.tealGlow}`,
            fontFamily: 'DM Sans,sans-serif' }}>{t('booking.accept')}</button>
        </div>
      </div>
    </div>
  );
}
