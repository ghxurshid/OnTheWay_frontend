/* ════════════════════════════════════════════════════════════════
   useCallSession — 1:1 voice-call lifecycle, lifted out of App.
   ────────────────────────────────────────────────────────────────
   Owns callState (+ a ref mirror the app's push-sim reads) and every
   transition: place / accept / decline / end, plus the CallHub event
   subscription that keeps both peers' screens in step. Real calls drive
   the hub; simulated walkers get a demo approach on the map.

   Shared app pieces are injected: notify (push toast), the map controller
   (demo approach), userLocRef, and the roster refs used to resolve an
   incoming caller's display card.
   ════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from 'react';
import { t } from '@/i18n';
import { USE_MOCKS } from '@/api/client';
import { TASHKENT } from '@/constants/map';
import { callClient } from '@/services/realtime';
import { savedStore } from '@/services/savedStore';
import { inviteToCallUser } from '@/utils/callUser';

const REAL_ID_RE = /^\d+$/;
const isRealUser = (id) => !USE_MOCKS && REAL_ID_RE.test(String(id ?? ''));

export function useCallSession({ authReady, notify, mapHook, userLocRef, liveWalkersRef, contactsRef, dismissSelected }) {
  const [callState, setCallState] = useState(null);
  const callStateRef = useRef(null);
  useEffect(() => { callStateRef.current = callState; }, [callState]);

  // Incoming calls + lifecycle transitions from the CallHub.
  useEffect(() => {
    if (USE_MOCKS || !authReady) return undefined;
    const offIncoming = callClient.on('incoming', (invite) => {
      if (callStateRef.current) return; // already on a call (client auto-rejects)
      setCallState({ user: inviteToCallUser(invite, liveWalkersRef.current, contactsRef.current), phase: 'ringing', live: true, role: 'callee' });
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
          notify({ title: t('call.micDeniedTitle'), body: '' });
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
    return () => { offIncoming(); offAccepted(); offEnded(); offRejected(); };
  }, [authReady]); // eslint-disable-line react-hooks/exhaustive-deps -- refs + notify are stable

  const handleCall = async (user) => {
    dismissSelected?.();
    if (isRealUser(user.id)) {
      try {
        await callClient.startCall(user.id, 'audio');
        setCallState({ user, phase: 'ringing', live: true, role: 'caller' });
      } catch (e) {
        notify({ title: t('call.failedTitle'), body: e?.message || '' });
      }
      return;
    }
    setCallState({ user, phase: 'ringing' });
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

  const handleAgreeRide = () => {
    const u = callState && callState.user;
    if (!u) return;
    const pid = 'partner-' + u.id;
    if (!savedStore.has(pid)) {
      savedStore.toggle({ id: pid, type: 'partner', initials: u.initials, label: u.name, sub: u.sub });
    }
    notify({
      title: t('push.rideAgreedTitle'),
      body: t('push.rideAgreedBody', { name: u.name.split(' ')[0] }),
    });
  };

  const handleAcceptCall = () => {
    if (callState?.live) {
      // Flip to active only once the server confirmed the accept, so this screen
      // and the caller's change together. A refused accept or a later mic denial
      // closes the UI via 'ended'.
      callClient.acceptCall()
        .then(() => setCallState((c) => (c && c.live ? { ...c, phase: 'active' } : c)))
        .catch(() => setCallState(null));
      return;
    }
    // Demo mode: instant accept + a simulated approach on the map.
    setCallState((c) => ({ ...c, phase: 'active' }));
    const userLoc = userLocRef.current || TASHKENT;
    const from = (callState && callState.user && callState.user.latlng) || [41.310, 69.255];
    mapHook.startTracking(from, userLoc, () => { /* ETA */ });
  };

  const clearCall = () => setCallState(null);

  return { callState, callStateRef, clearCall, handleCall, endCall, declineCall, handleAcceptCall, handleAgreeRide };
}
