import { useCallback, useEffect, useState } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { tripApi } from '@/api/tripApi';
import { useAsync } from '@/hooks/useAsync';
import { confirmAction } from '@/services/confirm';
import { FullScreenPanel } from '@/components/ui/FullScreenPanel';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState, ErrorState } from '@/components/ui/StatusStates';
import { fmtDayTime } from '@/utils/datetime';
import { errorMessage } from '@/utils/errors';

/** An open trip as GET /trips/mine returns it (TripResponseDto). */
interface OwnTrip {
  id: string;
  origin?: { address?: string };
  destination?: { address?: string };
  departureTimeUtc: string;
  status: string;
  category: string;
  role: string;
  isVisible: boolean;
  notes?: string | null;
}

interface MyTripsScreenProps {
  onClose: () => void;
  /** Reports how many trips are still open after a change (engagement follows it). */
  onChanged?: (openCount: number) => void;
}

/** The caller's own open trips: review them and cancel a planned one. */
export function MyTripsScreen({ onClose, onChanged }: MyTripsScreenProps) {
  const loader = useCallback(() => tripApi.mine() as Promise<OwnTrip[]>, []);
  const { data, loading, error, reload } = useAsync<OwnTrip[]>(loader, [], []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const trips = data || [];

  useEffect(() => { if (!loading && !error) onChanged?.(trips.length); }, [loading, error, trips.length]); // eslint-disable-line react-hooks/exhaustive-deps -- report on change

  const cancel = async (trip: OwnTrip) => {
    const ok = await confirmAction({
      title: t('myTrips.cancelConfirmTitle'), body: t('myTrips.cancelConfirmBody'),
      confirmLabel: t('myTrips.cancel'), cancelLabel: t('common.close'), danger: true,
    });
    if (!ok) return;
    setBusyId(trip.id);
    setActionError(null);
    try {
      await tripApi.cancel(trip.id);
      reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const body = () => {
    if (loading) return <Spinner label={null} />;
    if (error) return <ErrorState error={error} onRetry={reload} />;
    if (trips.length === 0) return <EmptyState icon="🗓️" title={t('myTrips.emptyTitle')} body={t('myTrips.emptyBody')} />;
    return trips.map((trip) => {
      const live = trip.category.toLowerCase() === 'live';
      const driver = trip.role.toLowerCase() === 'driver';
      return (
        <div key={trip.id} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 16,
          padding: '14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 7,
              color: live ? T.green : T.amber, background: live ? `${T.green}1c` : T.amberDim }}>
              {live ? t('myTrips.live') : t('myTrips.planned')}
            </span>
            <span style={{ fontSize: 11.5, color: T.muted }}>{driver ? t('myTrips.driverRole') : t('myTrips.passengerRole')}</span>
            {!trip.isVisible && !live && <span style={{ fontSize: 11.5, color: T.red }}>{t('myTrips.hidden')}</span>}
          </div>
          <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.45 }}>
            <div>📍 {trip.origin?.address || '—'}</div>
            <div style={{ color: T.muted }}>🏁 {trip.destination?.address || '—'}</div>
          </div>
          <div style={{ fontSize: 12.5, color: T.text, fontWeight: 600 }}>🕐 {fmtDayTime(new Date(trip.departureTimeUtc))}</div>
          {trip.notes && <div style={{ fontSize: 12, color: T.muted, whiteSpace: 'pre-line' }}>{trip.notes}</div>}
          {live ? (
            <div style={{ fontSize: 12, color: T.muted }}>{t('myTrips.liveHint')}</div>
          ) : (
            <button onClick={() => cancel(trip)} disabled={busyId === trip.id} style={{ alignSelf: 'flex-start', marginTop: 2,
              padding: '9px 16px', borderRadius: 11, border: `1px solid ${T.red}55`, background: `${T.red}12`,
              color: T.red, fontSize: 13, fontWeight: 600, cursor: busyId === trip.id ? 'progress' : 'pointer',
              fontFamily: 'DM Sans,sans-serif' }}>
              {busyId === trip.id ? t('common.sending') : t('myTrips.cancel')}
            </button>
          )}
        </div>
      );
    });
  };

  return (
    <FullScreenPanel title={t('myTrips.title')} onClose={onClose}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {actionError && <div role="alert" style={{ fontSize: 12.5, color: T.red }}>{actionError}</div>}
        {body()}
      </div>
    </FullScreenPanel>
  );
}
