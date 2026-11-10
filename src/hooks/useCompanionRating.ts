/* ════════════════════════════════════════════════════════════════
   useCompanionRating — the companion's side of "rate after the trip".
   ────────────────────────────────────────────────────────────────
   The trip's owner finishes on their own screen; the person riding with them
   only hears about it (presence `TripEvent`). This hook turns that into the
   same trip summary: at once when I am not navigating, or remembered until my
   own part of the journey ends (see services/journeyRating for the rules).
   ════════════════════════════════════════════════════════════════ */

import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { ApiError, USE_MOCKS } from '@/api/client';
import { walkerApi } from '@/api/walkerApi';
import { t } from '@/i18n';
import { agreementService } from '@/services/agreementService';
import { agreementStore } from '@/services/agreementStore';
import type { AgreementPeer } from '@/services/agreementStore';
import { authStore } from '@/services/authStore';
import { blockStore } from '@/services/blockStore';
import { completedBy, journeyRating } from '@/services/journeyRating';
import type { CompletedTrip, TripEventDto, WaitingRating } from '@/services/journeyRating';
import { forgetCompanion } from '@/services/liveTripService';
import { presenceClient } from '@/services/realtime';
import { initialsOf } from '@/utils/avatar';
import { idOf } from '@/utils/ids';
import type { LatLng, Place, PartyType } from '@/models';

/** What the trip summary needs to offer a rating on someone else's trip. */
export interface CompanionOffer extends WaitingRating {
  /** Where the trip went ("same route again"), when known. */
  route?: { from: Place | null; to: Place | null };
}

interface UseCompanionRatingArgs {
  authReady: boolean;
  /** Whether a route is being navigated right now. */
  activeRoute: unknown;
  activeRouteRef: MutableRefObject<unknown>;
  onOffer: (offer: CompanionOffer) => void;
}

const toPlace = (p: CompletedTrip['origin']): Place | null =>
  (p?.latitude != null && p?.longitude != null ? { latlng: [p.latitude, p.longitude] as LatLng, label: p.address || '' } : null);

/** The other person of the journey, by the best source at hand. Null when the
    server no longer shows them to me (404: a block, or the account is gone). */
async function peerOf(actor: string, trip: CompletedTrip, ended: Map<string, AgreementPeer>): Promise<AgreementPeer | null> {
  const known = agreementStore.all().find((a) => a.peer.id === actor)?.peer || ended.get(actor);
  if (known) return known;
  const type: PartyType = String(trip.role || '').toLowerCase() === 'driver' ? 'driver' : 'passenger';
  try {
    const p = await walkerApi.profile(actor);
    if (!p) return null;
    return { id: actor, name: p.name, initials: initialsOf(p.name), type, vehicle: p.vehicle || null, photoUrl: p.photoUrl || null };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    const name = t('common.user');
    return { id: actor, name, initials: initialsOf(name), type };
  }
}

export function useCompanionRating({ authReady, activeRoute, activeRouteRef, onOffer }: UseCompanionRatingArgs): void {
  const onOfferRef = useRef(onOffer);
  onOfferRef.current = onOffer;

  useEffect(() => {
    if (USE_MOCKS || !authReady) return undefined;
    let alive = true;
    // The agreement usually ends a moment before (or after) the event arrives.
    const ended = new Map<string, AgreementPeer>();
    const offEnded = agreementService.onPeerEvent((e) => {
      if (e.kind === 'ended') ended.set(e.agreement.peer.id, e.agreement.peer);
    });
    const offTrip = presenceClient.on('TripEvent', async (evt: TripEventDto) => {
      const me = idOf((authStore.getUser() as { id?: string } | null)?.id ?? '');
      const actor = completedBy(evt, me);
      if (!actor || !evt.trip || blockStore.has(actor) || journeyRating.wasOffered(actor)) return;
      const trip = evt.trip;
      const peer = await peerOf(actor, trip, ended);
      if (!alive || !peer || journeyRating.wasOffered(actor) || blockStore.has(actor)) return; // blocked while resolving
      const waiting: WaitingRating = {
        peer, tripId: idOf(trip.id), distanceKm: trip.distanceKm || 0, durationMin: trip.estimatedMinutes || 0,
      };
      if (activeRouteRef.current) {
        journeyRating.remember(waiting); // my own finish offers it
        return;
      }
      journeyRating.markOffered(actor);
      forgetCompanion(actor); // the journey is over: not a companion of my next trip
      onOfferRef.current({ ...waiting, route: { from: toPlace(trip.origin), to: toPlace(trip.destination) } });
    });
    return () => { alive = false; offEnded(); offTrip(); };
  }, [authReady, activeRouteRef]);

  // A route that is over: whoever is still remembered (the finish offers one;
  // a route left without a finish offers none) is offered now, one after the
  // other. takeWaiting leaves out the blocked and the stale.
  const hadRouteRef = useRef(false);
  useEffect(() => {
    const had = hadRouteRef.current;
    hadRouteRef.current = !!activeRoute;
    if (!had || activeRoute || USE_MOCKS) return;
    journeyRating.takeWaiting().forEach((waiting) => {
      journeyRating.markOffered(waiting.peer.id);
      onOfferRef.current(waiting);
    });
  }, [activeRoute]);
}
