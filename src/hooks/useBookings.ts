/* ════════════════════════════════════════════════════════════════
   useBookings — ride-agreement (booking) domain, lifted out of App.
   Owns booking state + the realtime BookingEvent subscription and the
   store→list mirror. Exposes plain action handlers.
   ════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import { t } from '@/i18n';
import { USE_MOCKS } from '@/api/client';
import { bookingApi } from '@/api/bookingApi';
import { bookingStore } from '@/services/bookingStore';
import type { Booking, BookingEvent } from '@/services/bookingStore';
import { presenceClient } from '@/services/realtime';

interface Notify { (n: { title: string; body: string }): void }
interface UseBookingsArgs { authReady: boolean; notify: Notify }

const msg = (e: unknown): string => (e as Error)?.message || '';

export function useBookings({ authReady, notify }: UseBookingsArgs) {
  const [incomingBooking, setIncomingBooking] = useState<Booking | null>(null);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [agreements, setAgreements] = useState<Booking[]>([]);
  const [showAgreements, setShowAgreements] = useState(false);
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);

  // Realtime booking events: update the store and toast the affected party.
  useEffect(() => {
    if (USE_MOCKS || !authReady) return undefined;
    return presenceClient.on('BookingEvent', (evt: BookingEvent) => {
      if (!evt || !evt.type) return;
      bookingStore.apply(evt);
      if (evt.type === 'requested') setIncomingBooking(evt.booking);
      else notify({ title: t(`booking.${evt.type}Title`), body: t(`booking.${evt.type}Body`) });
    });
  }, [authReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the active-agreements list in step with the booking store.
  useEffect(() => {
    const sync = () => setAgreements(bookingStore.accepted());
    sync();
    return bookingStore.subscribe(sync);
  }, []);

  // Passenger requests a seat on a driver's trip (walker.id is the trip id).
  const requestRide = useCallback(async (w: { id: string }) => {
    try {
      await bookingApi.create(w.id, 1);
      notify({ title: t('booking.requestSentTitle'), body: t('booking.requestSentBody') });
    } catch (e) {
      notify({ title: t('booking.requestFailedTitle'), body: msg(e) });
    }
  }, [notify]);

  // Driver accepts / rejects an incoming request.
  const respondBooking = useCallback(async (b: Booking, action: 'accept' | 'reject') => {
    setBookingBusy(true);
    try {
      const updated = await bookingApi[action](b.id);
      if (updated) bookingStore.apply({ type: action === 'accept' ? 'accepted' : 'rejected', booking: updated });
    } catch (e) {
      notify({ title: t('booking.actionFailedTitle'), body: msg(e) });
    } finally {
      setBookingBusy(false);
      setIncomingBooking(null);
    }
  }, [notify]);

  // Cancel (either party) or complete (driver) an active agreement.
  const actOnAgreement = useCallback(async (b: Booking, action: 'cancel' | 'complete') => {
    setBusyBookingId(b.id);
    try {
      await bookingApi[action](b.id);
      const status = action === 'cancel' ? 'Cancelled' : 'Completed';
      bookingStore.apply({ type: action === 'cancel' ? 'cancelled' : 'completed', booking: { ...b, status } });
    } catch (e) {
      notify({ title: t('booking.actionFailedTitle'), body: msg(e) });
    } finally {
      setBusyBookingId(null);
    }
  }, [notify]);

  return {
    incomingBooking, bookingBusy, agreements, showAgreements, setShowAgreements, busyBookingId,
    requestRide, respondBooking, actOnAgreement,
  };
}
