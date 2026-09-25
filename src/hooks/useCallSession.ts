/* ════════════════════════════════════════════════════════════════
   useCallSession — 1:1 voice-call lifecycle, lifted out of App.
   ────────────────────────────────────────────────────────────────
   Owns callState (+ a ref mirror the app's push-sim reads) and every
   transition: place / accept / decline / end, plus the CallHub event
   subscription that keeps both peers' screens in step. Real calls drive
   the hub; simulated walkers get a demo approach on the map.

   "Ride together" is a real two-sided agreement: one side offers over the
   CallHub, the other accepts or declines. On acceptance both sides add each
   other as contacts and record the partner as a companion of the journey
   (sent when the trip is completed).

   Shared app pieces are injected: notify (push toast), the map controller
   (demo approach), userLocRef, and the roster refs used to resolve an
   incoming caller's display card.
   ════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { t } from '@/i18n';
import { USE_MOCKS } from '@/api/client';
import { TASHKENT } from '@/constants/map';
import { callClient, presenceClient } from '@/services/realtime';
import { savedStore } from '@/services/savedStore';
import { addContact } from '@/services/contactService';
import { recordCompanion } from '@/services/liveTripService';
import { inviteToCallUser } from '@/utils/callUser';
import type { CallUser } from '@/utils/callUser';
import type { LatLng } from '@/utils/geo';
import { isRealUserId } from '@/utils/ids';
import { errorMessage, isUserOffline } from '@/utils/errors';
import { startRingtone, stopRingtone } from '@/utils/ringtone';
import type { PushNotif } from '@/models';
import type { MapHook } from './mapHook';

const isRealUser = (id: string | number): boolean => !USE_MOCKS && isRealUserId(id);

/** Where the "ride together" agreement stands in the current call. */
export type RideOfferState = 'none' | 'sent' | 'received' | 'agreed' | 'declined';

interface CallState { user: CallUser; phase: string; live?: boolean; role?: 'caller' | 'callee'; offer: RideOfferState }
interface UseCallSessionArgs {
  authReady: boolean;
  notify: (n: PushNotif) => void;
  mapHook: MapHook;
  userLocRef: MutableRefObject<LatLng | null>;
  liveWalkersRef: MutableRefObject<Map<string, any>>;
  contactsRef: MutableRefObject<any[]>;
  dismissSelected?: () => void;
}

const firstName = (u: CallUser): string => (u.name || '').split(' ')[0];

export function useCallSession({ authReady, notify, mapHook, userLocRef, liveWalkersRef, contactsRef, dismissSelected }: UseCallSessionArgs) {
  const [callState, setCallState] = useState<CallState | null>(null);
  const callStateRef = useRef<CallState | null>(null);
  useEffect(() => { callStateRef.current = callState; }, [callState]);

  const setOffer = (offer: RideOfferState) => setCallState((c) => (c ? { ...c, offer } : c));

  // Both sides confirmed: remember the partner for this journey.
  const agree = (u: CallUser, live: boolean) => {
    setOffer('agreed');
    const pid = 'partner-' + u.id;
    if (!savedStore.has(pid)) {
      savedStore.toggle({ id: pid, type: 'partner', initials: u.initials, label: u.name, sub: u.sub, userId: String(u.id), partyType: u.type });
    }
    if (live) {
      recordCompanion(String(u.id));
      addContact(String(u.id)).catch(() => { /* the agreement stands even if the contact save fails */ });
    }
    notify({ title: t('push.rideAgreedTitle'), body: t('push.rideAgreedBody', { name: firstName(u) }) });
  };

  // Ring (sound + vibration) while an incoming call waits for an answer.
  const incomingRinging = !!callState && callState.role === 'callee' && callState.phase === 'ringing';
  useEffect(() => {
    if (!incomingRinging) return undefined;
    startRingtone();
    return stopRingtone;
  }, [incomingRinging]);

  // Incoming calls + lifecycle transitions from the CallHub.
  useEffect(() => {
    if (USE_MOCKS || !authReady) return undefined;
    const offIncoming = callClient.on('incoming', (invite) => {
      if (callStateRef.current) return; // already on a call (client auto-rejects)
      setCallState({ user: inviteToCallUser(invite, liveWalkersRef.current, contactsRef.current), phase: 'ringing', live: true, role: 'callee', offer: 'none' });
    });
    const offAccepted = callClient.on('accepted', () =>
      setCallState((cs) => (cs ? { ...cs, phase: 'active' } : cs)));
    const offEnded = callClient.on('ended', (evt) => {
      const cs = callStateRef.current;
      if (cs?.live) {
        if (evt?.reason === 'timeout') {
          notify(cs.role === 'caller'
            ? { title: t('call.noAnswerTitle'), body: cs.user?.name || '' }
            : { title: t('call.missedTitle'), body: cs.user?.name || '' });
        } else if (evt?.reason === 'mic-denied') {
          notify({ title: t('call.micDeniedTitle'), body: t('errors.micDenied') });
        }
      }
      setCallState(null);
    });
    const offRejected = callClient.on('rejected', () => {
      const cs = callStateRef.current;
      if (cs?.live && cs.role === 'caller') {
        notify({ title: t('call.declinedTitle'), body: cs.user?.name || '' });
      }
      setCallState(null);
    });
    const offOffer = callClient.on('rideOffer', () => setOffer('received'));
    const offAnswer = callClient.on('rideOfferAnswered', ({ accepted }) => {
      const cs = callStateRef.current;
      if (!cs) return;
      if (accepted) agree(cs.user, true);
      else setOffer('declined');
    });
    return () => { offIncoming(); offAccepted(); offEnded(); offRejected(); offOffer(); offAnswer(); };
  }, [authReady]); // eslint-disable-line react-hooks/exhaustive-deps -- refs + notify are stable

  // Nobody can answer a closed app: suggest a message instead (the backend
  // also pings them through the Telegram bot).
  const notifyOffline = (user: CallUser) => notify({
    title: t('call.offlineTitle', { name: firstName(user) }),
    body: t('call.offlineBody'),
    user,
    chat: true,
    action: t('common.chat'),
  });

  const handleCall = async (user: CallUser) => {
    dismissSelected?.();
    if (isRealUser(user.id)) {
      if (presenceClient.isConnected() && !presenceClient.isOnline(user.id)) { notifyOffline(user); return; }
      try {
        await callClient.startCall(String(user.id), 'audio');
        setCallState({ user, phase: 'ringing', live: true, role: 'caller', offer: 'none' });
      } catch (e) {
        if (isUserOffline(e)) notifyOffline(user);
        else notify({ title: t('call.failedTitle'), body: errorMessage(e) });
      }
      return;
    }
    setCallState({ user, phase: 'ringing', offer: 'none' });
  };

  // End/decline helpers that also drive the CallHub for real calls.
  const endCall = () => {
    if (callState?.live) callClient.hangup().catch(() => {});
    setCallState(null);
  };
  const declineCall = () => {
    if (callState?.live) {
      const reject = callState.role === 'callee' && callState.phase === 'ringing';
      (reject ? callClient.rejectCall() : callClient.hangup()).catch(() => {});
    }
    setCallState(null);
  };

  /** Offer to ride together. Demo calls simulate the other side accepting. */
  const offerRide = () => {
    const cs = callState;
    if (!cs) return;
    setOffer('sent');
    if (!cs.live) {
      setTimeout(() => { if (callStateRef.current) agree(cs.user, false); }, 1500);
      return;
    }
    callClient.sendRideOffer().catch((e) => {
      setOffer('none');
      notify({ title: t('call.failedTitle'), body: errorMessage(e) });
    });
  };

  /** Answer the other side's offer. */
  const respondRide = (accepted: boolean) => {
    const cs = callState;
    if (!cs?.live) return;
    callClient.respondRideOffer(accepted).catch(() => {});
    if (accepted) agree(cs.user, true);
    else setOffer('none');
  };

  const handleAcceptCall = () => {
    if (callState?.live) {
      // Flip to active only once the server confirmed the accept, so this screen
      // and the caller's change together. A refused accept or a later mic denial
      // closes the UI via 'ended'.
      callClient.acceptCall()
        .then(() => setCallState((c) => (c && c.live ? { ...c, phase: 'active' } : c)))
        .catch((e) => {
          setCallState(null);
          notify({ title: t('call.failedTitle'), body: errorMessage(e) });
        });
      return;
    }
    // Demo mode: instant accept + a simulated approach on the map.
    setCallState((c) => (c ? { ...c, phase: 'active' } : c));
    const userLoc = userLocRef.current || TASHKENT;
    const from: LatLng = (callState && callState.user && callState.user.latlng) || [41.310, 69.255];
    mapHook.startTracking(from, userLoc, () => { /* ETA */ });
  };

  const clearCall = () => setCallState(null);

  return { callState, callStateRef, clearCall, handleCall, endCall, declineCall, handleAcceptCall, offerRide, respondRide };
}
