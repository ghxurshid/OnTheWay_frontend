/* ════════════════════════════════════════════════════════════════
   useBookings — ride-agreement (booking) domain, lifted out of App.
   ────────────────────────────────────────────────────────────────
   Owns every piece of booking state (incoming request, active
   agreements, per-action busy flags) and the two effects that keep it
   in sync: the realtime BookingEvent subscription and the store→list
   mirror. Exposes plain action handlers; the app only wires them to UI.

   Depends only on a `notify({title, body})` sink (the app's push toast)
   and `authReady` (gates the realtime subscription).
   ════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import { t } from '@/i18n';
import { USE_MOCKS } from '@/api/client';
import { bookingApi } from '@/api/bookingApi';
import { bookingStore } from '@/services/bookingStore';
import { presenceClient } from '@/services/realtime';

export function useBookings({ authReady, notify }) {
  const [incomingBooking, setIncomingBooking] = useState(null); // driver's pending request prompt
  const [bookingBusy, setBookingBusy] = useState(false);
  const [agreements, setAgreements] = useState([]);             // accepted bookings (active agreements)
  const [showAgreements, setShowAgreements] = useState(false);
  const [busyBookingId, setBusyBookingId] = useState(null);

  // Realtime booking events: update the store and toast the affected party;
  // a new request (I'm the driver) opens an actionable accept/reject prompt.
  useEffect(() => {
    if (USE_MOCKS || !authReady) return undefined;
    return presenceClient.on('BookingEvent', (evt) => {
      if (!evt || !evt.type) return;
      bookingStore.apply(evt);
      if (evt.type === 'requested') setIncomingBooking(evt.booking);
      else notify({ title: t(`booking.${evt.type}Title`), body: t(`booking.${evt.type}Body`) });
    });
  }, [authReady]); // eslint-disable-line react-hooks/exhaustive-deps -- notify is a stable setter

  // Keep the active-agreements list in step with the booking store.
  useEffect(() => {
    const sync = () => setAgreements(bookingStore.accepted());
    sync();
    return bookingStore.subscribe(sync);
  }, []);

  // Passenger requests a seat on a driver's trip (walker.id is the trip id).
  // The caller clears any in-progress map task before invoking this.
  const requestRide = useCallback(async (w) => {
    try {
      await bookingApi.create(w.id, 1);
      notify({ title: t('booking.requestSentTitle'), body: t('booking.requestSentBody') });
    } catch (e) {
      notify({ title: t('booking.requestFailedTitle'), body: e?.message || '' });
    }
  }, [notify]);

  // Driver accepts / rejects an incoming request.
  const respondBooking = useCallback(async (b, action) => {
    setBookingBusy(true);
    try {
      const updated = await bookingApi[action](b.id);
      if (updated) bookingStore.apply({ type: action === 'accept' ? 'accepted' : 'rejected', booking: updated });
    } catch (e) {
      notify({ title: t('booking.actionFailedTitle'), body: e?.message || '' });
    } finally {
      setBookingBusy(false);
      setIncomingBooking(null);
    }
  }, [notify]);

  // Cancel (either party) or complete (driver) an active agreement.
  const actOnAgreement = useCallback(async (b, action) => {
    setBusyBookingId(b.id);
    try {
      await bookingApi[action](b.id);
      const status = action === 'cancel' ? 'Cancelled' : 'Completed';
      bookingStore.apply({ type: action === 'cancel' ? 'cancelled' : 'completed', booking: { ...b, status } });
    } catch (e) {
      notify({ title: t('booking.actionFailedTitle'), body: e?.message || '' });
    } finally {
      setBusyBookingId(null);
    }
  }, [notify]);

  return {
    incomingBooking, bookingBusy, agreements, showAgreements, setShowAgreements, busyBookingId,
    requestRide, respondBooking, actOnAgreement,
  };
}
