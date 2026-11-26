/* ════════════════════════════════════════════════════════════════
   useCallSession — 1:1 voice-call lifecycle, lifted out of App.
   ────────────────────────────────────────────────────────────────
   Owns callState (+ a ref mirror the app's push-sim reads) and every
   transition: place / accept / decline / end, plus the CallHub event
   subscription that keeps both peers' screens in step. Real calls drive
   the hub; simulated walkers get a demo approach on the map.

   "Ride together" is a real two-sided agreement: one side offers over the
   CallHub, the other accepts or declines. On acceptance the server records
   the agreement for the pair and shows it to both on every device
   (agreementService); both sides add each other as contacts and record the
   partner as a companion of the journey (sent when the trip is completed) —
   once per agreement, and also when it reaches this device after the call
   ended (accepted, then "end" at once): only the call screen's "agreed"
   needs the call.
   The server's agreement settles an open offer however it reaches this
   device — with the answer, or over presence when the call hub lost the
   answer in a reconnect or the two sides' offers crossed — and while the
   call lasts one that shows up after the offer closed turns the screen to
   "agreed" all the same. Whether the pair is agreed already is the
   server's word, never this device's copy: the server answers an offer to
   someone the offerer is agreed with itself, and never relays it.
   An offer is open only as long as the server keeps it (rideOffer): past
   that neither side waits for it, and an answer to an offer the server no
   longer holds (expired, lost in a restart) is refused — both sides read
   "no longer valid, ask again". Every other end of an offer says why on the
   call screen too, never in a toast (it would sit under the call screen):
   sending it failed, the agreement did not come. An accept that did not get
   through leaves the offer open, to be answered again ("tap again").
   The other person's later actions on the agreement — cancelled, at the
   pick-up, ended — surface here as toasts.

   Shared app pieces are injected: notify (push toast), the map controller
   (demo approach), userLocRef, and the roster refs used to resolve an
   incoming caller's display card.
   ════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { agreementService } from '@/services/agreementService';
import { AGREEMENT_EVENT, agreementStore } from '@/services/agreementStore';
import type { Agreement } from '@/services/agreementStore';
import { haptic } from '@/services/telegram';
import { t } from '@/i18n';
import { USE_MOCKS } from '@/api/client';
import { TASHKENT } from '@/constants/map';
import { callClient, presenceClient } from '@/services/realtime';
import { RIDE_OFFER_LIFETIME_MS, RIDE_OFFER_WAIT_MS, isAnswerLost, isAnswerUnsent, isOfferExpired } from '@/services/realtime/rideOffer';
import { savedStore } from '@/services/savedStore';
import { blockStore } from '@/services/blockStore';
import { addContact } from '@/services/contactService';
import { recordCompanion } from '@/services/liveTripService';
import { inviteToCallUser, offlineNotice } from '@/utils/callUser';
import type { CallUser } from '@/utils/callUser';
import type { LatLng } from '@/utils/geo';
import { idOf, isRealUserId } from '@/utils/ids';
import { errorMessage, isUserOffline } from '@/utils/errors';
import { startRingtone, stopRingtone } from '@/utils/ringtone';
import type { PushNotif } from '@/models';
import type { MapHook } from './mapHook';

const isRealUser = (id: string | number): boolean => !USE_MOCKS && isRealUserId(id);

/** Where the "ride together" agreement stands in the current call. 'unsent': their offer still
    stands but my accept did not get through — answer again. After 'declined', 'expired' (the
    offer is not open on the server any more) and a failure the offer button is back, with a line
    saying why. */
export type RideOfferState = 'none' | 'sent' | 'received' | 'unsent' | 'agreed' | 'declined' | 'expired' | RideOfferFailure;

/** The offer ended without an agreement — sending it failed, or the agreement did not come.
    `failed` is why, in the user's language, as the call screen says it. */
export interface RideOfferFailure { failed: string }

interface CallState { user: CallUser; phase: string; live?: boolean; role?: 'caller' | 'callee'; offer: RideOfferState }

/** The offer open in this call, as this side handles it. Every transition decides on it (the
    `offer` on screen follows); whatever settles it first wins, the rest find it gone. */
interface OpenOffer {
  /** I made it and wait for the answer; else it was made to me. */
  mine: boolean;
  /** When this side stops waiting for it (epoch ms). */
  until: number;
  /** An accept — mine, or the peer's to my offer — is on its way to or back from the server, or
      waits for the agreement it made: no timer ends the offer meanwhile and no second answer
      goes out. */
  confirming: boolean;
  /** An accept of mine whose reply never came may have reached the server: its agreement may follow. */
  maybeAccepted?: boolean;
}

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

/** The server's agreement with user `id`, when it holds one (agreementService keeps the copy here). */
const agreementWith = (id: string | number): Agreement | undefined => {
  const peerId = idOf(id);
  return agreementStore.serverAgreements().find((a) => a.peer.id === peerId);
};

export function useCallSession({ authReady, notify, mapHook, userLocRef, liveWalkersRef, contactsRef, dismissSelected }: UseCallSessionArgs) {
  const [callState, setCallStateValue] = useState<CallState | null>(null);
  const callStateRef = useRef<CallState | null>(null);
  const openRef = useRef<OpenOffer | null>(null);
  // Bumped for every offer opened: its timer follows that offer, even when it replaces one shown
  // the same way.
  const [openCount, setOpenCount] = useState(0);
  // The server agreements confirmed on this device (companion, contact, partner, notice): once each,
  // whichever way they came.
  const confirmedRef = useRef(new Set<string>());

  // callState and its ref change together, at once: the handlers below decide on the ref, and
  // two server events can land before React renders. A new call (or none) has no offer open.
  const setCallState = (next: CallState | null | ((c: CallState | null) => CallState | null)) => {
    if (typeof next !== 'function') leaveOffer();
    const value = typeof next === 'function' ? next(callStateRef.current) : next;
    callStateRef.current = value;
    setCallStateValue(value);
  };

  /** The call is over (or another began) with an offer open. An accept that may have reached the
      server can still become the agreement — the peer's to my offer, sent as the call ended (its
      answer has no call to land in now), or mine whose reply never came: it is confirmed when it
      shows up. (An accept still on its way is followed by its reply.) */
  const leaveOffer = () => {
    const open = openRef.current;
    const cs = callStateRef.current;
    openRef.current = null;
    if (open && cs?.live && !open.confirming && (open.mine || open.maybeAccepted)) void waitForAgreement(open, cs.user);
  };

  const setOffer = (offer: RideOfferState) => setCallState((c) => (c && c.offer !== offer ? { ...c, offer } : c));

  /** Opens an offer — made by me, or to me — in place of whatever was open. Whether the pair is
      agreed already is the server's word, never this device's copy (it may be stale): the server
      answers my offer to someone I am agreed with itself, and relays to me only an offer the
      pair's agreement does not answer — it waits for my own tap. */
  const openOffer = (mine: boolean): OpenOffer => {
    const open: OpenOffer = { mine, until: Date.now() + (mine ? RIDE_OFFER_WAIT_MS : RIDE_OFFER_LIFETIME_MS), confirming: false };
    openRef.current = open;
    setOffer(mine ? 'sent' : 'received');
    setOpenCount((n) => n + 1);
    return open;
  };

  /** `open` is over with `result` — unless it was settled or replaced already. */
  const closeOffer = (open: OpenOffer, result: 'none' | 'declined' | 'expired' | RideOfferFailure): boolean => {
    if (openRef.current !== open) return false;
    openRef.current = null;
    setOffer(result);
    return true;
  };

  /** `open` ended in the pair's agreement: the call screen reads agreed while it shows this offer,
      and the agreement is confirmed — a real call's also when the call is over by now. */
  const settleAgreed = (open: OpenOffer, u: CallUser, live: boolean) => {
    if (openRef.current === open) {
      openRef.current = null;
      showAgreed(u, live);
    } else if (live) confirmAgreed(u, true);
  };

  /** The call screen reads agreed; the agreement is confirmed. */
  const showAgreed = (u: CallUser, live: boolean) => {
    setOffer('agreed');
    confirmAgreed(u, live);
  };

  /** The server holds `open` no longer — unless the pair's agreement is here: that settles it. */
  const expireOffer = (open: OpenOffer, cs: CallState) => {
    if (cs.live && agreementWith(cs.user.id)) settleAgreed(open, cs.user, true);
    else closeOffer(open, 'expired');
  };

  /** Waits — bounded, as whenAgreedWith is — for the server's agreement with `u` after an accept
      that may have reached it, and settles `open` with it when it shows up. The call may be over
      by then: the agreement is confirmed all the same. Resolves whether it came. */
  const waitForAgreement = (open: OpenOffer, u: CallUser): Promise<boolean> =>
    agreementService.whenAgreedWith(String(u.id)).then((agreed) => {
      if (agreed) settleAgreed(open, u, true);
      return agreed;
    });

  // An accept the server took — mine, or the peer's to my offer. A real call counts only once
  // the server holds the agreement: an "accepted" without one (an offer that was never made,
  // expired, a block in between) must not record a companion or a contact. The call screen
  // waits meanwhile and says so when none came.
  const awaitAgreement = (open: OpenOffer, u: CallUser) => {
    open.confirming = true;
    if (openRef.current === open) setOffer('sent'); // "waiting" until the server confirms (normally a moment)
    void waitForAgreement(open, u).then((agreed) => {
      if (!agreed) closeOffer(open, { failed: t('call.offerUnconfirmed') });
    });
  };

  /** My accept did not get through, as far as this side knows: the offer still stands — answer
      again (the call screen says so). One whose reply was lost may have reached the server all
      the same: its agreement settles the offer when it shows up (watched while the call lasts,
      waited for once it is over). */
  const answerUnsent = (open: OpenOffer, u: CallUser, e: unknown) => {
    open.confirming = false;
    if (isAnswerLost(e)) open.maybeAccepted = true;
    if (openRef.current === open) setOffer('unsent');
    else if (open.maybeAccepted) void waitForAgreement(open, u); // the call ended meanwhile
  };

  // The agreement stands: remember the partner for this journey — once per agreement, whichever
  // way it reached this device, the call screen open or not (past it, the notice is a toast in
  // view). A real call counts only with the server's agreement; a demo call makes one up.
  const confirmAgreed = (u: CallUser, live: boolean) => {
    if (live) {
      const agreement = agreementWith(u.id);
      if (!agreement) return;
      const key = agreement.id || agreement.peer.id;
      if (confirmedRef.current.has(key)) return;
      confirmedRef.current.add(key);
    }
    // The map, chat and trip summary follow the agreement from here on (a demo call's stays
    // local; for a real call the server's copy is here, and a pending offer of mine gives way).
    agreementService.agreedInCall({ id: String(u.id), name: u.name, initials: u.initials, type: u.type,
      vehicle: u.type === 'driver' ? u.sub || null : null });
    haptic('success');
    const pid = 'partner-' + u.id;
    if (!savedStore.has(pid)) {
      savedStore.toggle({ id: pid, type: 'partner', initials: u.initials, label: u.name, sub: u.sub, userId: String(u.id), partyType: u.type });
    }
    if (live) {
      recordCompanion(String(u.id));
      addContact(String(u.id)).catch(() => { /* the agreement stands even if the contact save fails */ });
    }
    notify({ title: t('push.rideAgreedTitle'), body: t('push.rideAgreedBody', { name: firstName(u) }), kind: 'agree', priority: 'high' });
  };

  // What the other person does to an agreement (any device, also after a
  // reconnect): a toast, so it is noticed even away from the map card.
  useEffect(() => agreementService.onPeerEvent((e) => {
    const peer = e.agreement.peer;
    const first = (peer.name || '').split(' ')[0] || t('common.user');
    // (Who is no companion any more is agreementService's business.)
    if (e.kind === 'arrived') {
      haptic('success');
      notify({ title: t('agree.peerArrived', { name: first }), body: peer.vehicle || peer.name, kind: 'agree', priority: 'high' });
    } else if (e.kind === 'cancelled') {
      haptic('warning');
      notify({ title: t('agree.peerCancelled', { name: first }), body: peer.name, kind: 'agree', priority: 'high' });
    } else {
      notify({ title: t('agree.ended'), body: peer.name, kind: 'agree', priority: 'high' });
    }
  }), [notify]);

  // An offer is open only as long as the server keeps it: past that neither side waits — the
  // one who received it stops showing it, the one who made it a little later (an answer given
  // at the last moment still has to arrive). Both can offer again. Unless the pair's agreement
  // is here by then: the offer was answered, whatever became of that answer.
  const offer = callState?.offer;
  useEffect(() => {
    const open = openRef.current;
    if (!open || (offer !== 'sent' && offer !== 'received' && offer !== 'unsent')) return undefined;
    const timer = setTimeout(() => {
      const cs = callStateRef.current;
      if (cs && openRef.current === open && !open.confirming) expireOffer(open, cs);
    }, Math.max(0, open.until - Date.now()));
    return () => clearTimeout(timer);
  }, [offer, openCount]); // eslint-disable-line react-hooks/exhaustive-deps -- refs + setters are stable

  // The agreement can reach this device another way than the answer: over presence
  // (AgreementUpdated, or GetAgreements after a reconnect) when the call hub lost the answer in a
  // reconnect, an accept's reply never came, or both sides offered at once. Watched while the
  // call is live, until it reads agreed: the agreement settles the open offer, and one that shows
  // up with no offer open (it expired, was declined, failed) turns the screen agreed all the same.
  // One the pair had before the watch began is no news, and settles no offer either: this device's
  // copy may be stale, and an offer the server's agreement answers is answered by the server.
  const watched = callState?.live && callState.offer !== 'agreed' ? String(callState.user.id) : null;
  useEffect(() => {
    if (!watched) return undefined;
    let known = agreementWith(watched)?.id;
    const check = () => {
      const cs = callStateRef.current;
      if (!cs?.live || String(cs.user.id) !== watched) return;
      const agreement = agreementWith(watched);
      const appeared = !!agreement && agreement.id !== known;
      known = agreement?.id;
      const open = openRef.current;
      if (open && appeared) settleAgreed(open, cs.user, true);
      else if (appeared && cs.offer !== 'agreed') showAgreed(cs.user, true);
    };
    check(); // it may have come before this watch began
    window.addEventListener(AGREEMENT_EVENT, check);
    return () => window.removeEventListener(AGREEMENT_EVENT, check);
  }, [watched]); // eslint-disable-line react-hooks/exhaustive-deps -- refs + setters are stable

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
    const offOffer = callClient.on('rideOffer', () => {
      if (callStateRef.current) openOffer(false);
    });
    const offAnswer = callClient.on('rideOfferAnswered', ({ accepted }) => {
      const cs = callStateRef.current;
      const open = openRef.current;
      // The answer to my offer — or, the two offers crossed, the peer took mine while I still see
      // theirs: that "yes" is the agreement too, while a "no" to mine leaves theirs to answer.
      // (A forged or stale "accept" is relayed as not accepted — it never reads "declined".)
      if (!cs || !open || open.confirming) return;
      if (accepted) awaitAgreement(open, cs.user);
      else if (open.mine) closeOffer(open, 'declined');
    });
    const offExpired = callClient.on('rideOfferExpired', () => {
      const cs = callStateRef.current;
      const open = openRef.current;
      // The peer accepted my offer after the server stopped holding it: "no longer valid", as
      // they read it too. The plain "not accepted" sent after it for older apps finds it closed.
      if (cs && open?.mine && !open.confirming) expireOffer(open, cs);
    });
    return () => { offIncoming(); offAccepted(); offEnded(); offRejected(); offOffer(); offAnswer(); offExpired(); };
  }, [authReady]); // eslint-disable-line react-hooks/exhaustive-deps -- refs + notify are stable

  const notifyOffline = (user: CallUser) => notify(offlineNotice(user, blockStore.has(user.id)));

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
    const cs = callStateRef.current;
    if (!cs) return;
    const open = openOffer(true);
    if (!cs.live) {
      setTimeout(() => settleAgreed(open, cs.user, false), 1500);
      return;
    }
    // Refused — no connection, asked to slow down, a block, the call over: the call screen says why.
    callClient.sendRideOffer().catch((e) => { closeOffer(open, { failed: errorMessage(e) }); });
  };

  /** Answer the other side's offer — once (two taps in one frame both see it open). */
  const respondRide = (accepted: boolean) => {
    const cs = callStateRef.current;
    const open = openRef.current;
    if (!cs?.live || !open || open.mine || open.confirming) return;
    const answer = callClient.respondRideOffer(accepted);
    if (!accepted) {
      answer.catch(() => {}); // declining an offer that is gone already changes nothing
      closeOffer(open, 'none');
      return;
    }
    open.confirming = true;
    setOffer('sent'); // "waiting" until the server confirms (normally a moment)
    // Followed to the end even when the call is over first: an accept that went through still
    // becomes the agreement then.
    answer.then(
      () => awaitAgreement(open, cs.user),
      (e: unknown) => {
        if (isOfferExpired(e)) expireOffer(open, cs);
        else if (isAnswerUnsent(e)) answerUnsent(open, cs.user, e);
        else awaitAgreement(open, cs.user); // a fault on the server: it may have recorded the agreement first
      });
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
