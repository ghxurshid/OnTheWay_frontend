import { T } from '@/constants/theme';
import { t } from '@/i18n';

/** Bottom sheet listing the walker's active ride agreements (accepted bookings)
 *  with cancel (either party) and complete (driver only) actions. */
export function BookingAgreementsSheet({ bookings, myId, busyId, onCancel, onComplete, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 30,
      background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-end', pointerEvents: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: T.glassSolid,
        backdropFilter: 'blur(24px)', borderRadius: '22px 22px 0 0', border: `1px solid ${T.border}`,
        borderBottom: 'none', padding: '18px 16px calc(22px + env(safe-area-inset-bottom,0px))',
        maxHeight: '70vh', overflowY: 'auto', animation: 'nb-panel-in .32s cubic-bezier(.22,1,.36,1) both' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: 18 }}>🤝</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{t('booking.agreementsTitle')}</span>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 9, border: `1px solid ${T.border}`,
            background: T.hover, color: T.muted, cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center' }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke={T.muted} strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {bookings.length === 0 ? (
          <div style={{ padding: '28px 12px', textAlign: 'center', color: T.muted, fontSize: 13 }}>
            {t('booking.noAgreements')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bookings.map((b) => {
              const amDriver = String(b.passengerId) !== String(myId);
              const busy = busyId === b.id;
              return (
                <div key={b.id} style={{ background: T.surface2, borderRadius: 14, border: `1px solid ${T.border}`,
                  padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: `${T.teal}18`, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                    {amDriver ? '🧑‍✈️' : '🚗'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>
                      🪑 {b.seatsBooked} {t('common.seats')}
                    </div>
                    <div style={{ fontSize: 11.5, color: T.teal }}>
                      {amDriver ? t('booking.roleDriver') : t('booking.rolePassenger')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {amDriver && (
                      <button onClick={() => onComplete(b)} disabled={busy} style={{ padding: '9px 12px', borderRadius: 11,
                        border: 'none', background: `linear-gradient(135deg,${T.teal},#0e9e97)`, color: 'white',
                        fontSize: 12.5, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                        fontFamily: 'DM Sans,sans-serif' }}>{t('booking.complete')}</button>
                    )}
                    <button onClick={() => onCancel(b)} disabled={busy} style={{ padding: '9px 12px', borderRadius: 11,
                      border: `1px solid ${T.red}40`, background: 'rgba(255,92,114,0.08)', color: T.red,
                      fontSize: 12.5, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                      fontFamily: 'DM Sans,sans-serif' }}>{t('booking.cancel')}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
