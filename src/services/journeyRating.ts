/* ════════════════════════════════════════════════════════════════
   SERVICE — rating the other person of a shared journey.
   ────────────────────────────────────────────────────────────────
   The server takes a rating between a trip's owner and a confirmed companion,
   on a completed trip, once per (trip, rater). Two people riding together may
   each have their own Live trip, so one journey can complete twice and a
   person can be told about it (presence `TripEvent`, sent to the companions of
   a trip that completed) before, while or after their own part ends:

   - Their trip completed, I am not navigating → offer now, on THEIR trip.
   - Their trip completed, I am navigating → remembered ("waiting"); my own
     finish offers it. A route that ends without a finish offers it then.
   - My own finish → on MY trip when they are my recorded companion, else on
     THEIR trip when that one is known. With neither, there is nothing valid to
     rate on yet: their own completion will open it here.

   One offer per person per journey — a dismissed offer counts too. A journey
   with someone lasts until the next agreement with them is formed; ratings
   only ever follow an agreement, so that is exactly when a new one can be due.
   Never offered: someone blocked by then, or a remembered trip older than a
   day (a route abandoned long ago). Several remembered people are all kept.
   ════════════════════════════════════════════════════════════════ */

import { USE_MOCKS } from '@/api/client';
import { AGREEMENT_EVENT, agreementStore } from '@/services/agreementStore';
import { blockStore } from '@/services/blockStore';
import type { AgreementPeer } from '@/services/agreementStore';
import { idOf, isRealUserId } from '@/utils/ids';
import { readJson, writeJson } from '@/utils/storage';

const KEY = 'ontheway_journey_ratings_v1';
/** Offers older than this are forgotten (only to keep the store small). */
const OFFER_MEMORY_MS = 14 * 24 * 60 * 60 * 1000;
/** A remembered trip is offered only this long after it completed. */
const WAITING_TTL_MS = 24 * 60 * 60 * 1000;

/** A trip as TripEvent carries it (TripResponseDto). */
export interface CompletedTrip {
  id: string | number;
  role?: string;
  companionIds?: Array<string | number>;
  distanceKm?: number | null;
  estimatedMinutes?: number | null;
  origin?: { latitude?: number; longitude?: number; address?: string } | null;
  destination?: { latitude?: number; longitude?: number; address?: string } | null;
}

/** The presence hub's TripEvent. */
export interface TripEventDto { type?: string; trip?: CompletedTrip | null; actorUserId?: string | number | null }

/** Someone's completed trip I can still rate them on. */
export interface WaitingRating {
  peer: AgreementPeer;
  tripId: string;
  distanceKm: number;
  durationMin: number;
  /** When it was remembered (epoch ms; set by `remember`). */
  at?: number;
}

/** An offer made: when, and during which agreement with them (if one was still up). */
interface Offer { at: number; agreement: string | null }
interface Memory { offered: Record<string, Offer>; waiting: WaitingRating[] }

function loadMemory(): Memory {
  const stored = readJson<{ offered?: Record<string, Offer>; waiting?: WaitingRating | WaitingRating[] | null }>(KEY, {});
  const offered: Record<string, Offer> = {};
  const oldest = Date.now() - OFFER_MEMORY_MS;
  Object.entries(stored.offered || {}).forEach(([id, offer]) => { if (offer?.at > oldest) offered[id] = offer; });
  // An older build kept a single entry (without a time: treat it as now).
  const waiting = (Array.isArray(stored.waiting) ? stored.waiting : stored.waiting ? [stored.waiting] : [])
    .map((w) => ({ ...w, at: w.at ?? Date.now() }));
  return { offered, waiting };
}

let memory: Memory = loadMemory();
const save = () => writeJson(KEY, memory);

/** Which agreement with this person is up now (a local one has no id yet). */
const agreementWith = (peerId: string): string | null => {
  const a = agreementStore.all().find((x) => x.peer.id === peerId && x.status !== 'pending');
  return a ? a.id ?? 'local' : null;
};

/** The person who completed a journey of mine — or null when the event is not one. */
export function completedBy(evt: TripEventDto | null | undefined, myId: string): string | null {
  if (!evt || evt.type !== 'completed' || !evt.trip || !myId) return null;
  const actor = idOf(evt.actorUserId);
  if (!actor || actor === myId) return null;
  return (evt.trip.companionIds || []).map(idOf).includes(myId) ? actor : null;
}

export const journeyRating = {
  wasOffered: (peerId: string): boolean => memory.offered[idOf(peerId)] != null,

  markOffered(peerId: string): void {
    const id = idOf(peerId);
    memory = { ...memory, offered: { ...memory.offered, [id]: { at: Date.now(), agreement: agreementWith(id) } } };
    save();
  },

  /** I am still travelling: keep their trip for when my part ends (one entry
      per person; others already remembered stay). */
  remember(waiting: WaitingRating): void {
    const entry = { ...waiting, at: Date.now() };
    memory = { ...memory, waiting: [...memory.waiting.filter((w) => w.peer.id !== entry.peer.id), entry] };
    save();
  },

  /** Take the remembered ratings still worth offering, oldest first: not offered
      meanwhile, not blocked since, not older than a day. All are cleared. */
  takeWaiting(): WaitingRating[] {
    const list = memory.waiting;
    if (!list.length) return [];
    memory = { ...memory, waiting: [] };
    save();
    const fresh = Date.now() - WAITING_TTL_MS;
    return list.filter((w) => (w.at ?? 0) > fresh && !journeyRating.wasOffered(w.peer.id) && !blockStore.has(w.peer.id));
  },

  /** Put back remembered ratings that were taken but not used. */
  keepWaiting(list: WaitingRating[]): void {
    if (!list.length) return;
    memory = { ...memory, waiting: [...list, ...memory.waiting.filter((w) => !list.some((x) => x.peer.id === w.peer.id))] };
    save();
  },

  /** My own route finished: whom to offer, and on which trip. Marks the offer.
      `agreementPeer` is the agreed person still on screen (a local demo walker's
      rating stays local, so it needs no trip); `myCompanions` must be read before
      the trip is closed. */
  forFinish({ agreementPeer, myTripId, myCompanions }: {
    agreementPeer: AgreementPeer | null;
    myTripId: string | null;
    myCompanions: string[];
  }): { partner: AgreementPeer | null; tripId: string | null } {
    const remembered = journeyRating.takeWaiting();
    const partner = (agreementPeer && !blockStore.has(agreementPeer.id) ? agreementPeer : null) || remembered[0]?.peer || null;
    const waiting = partner ? remembered.find((w) => w.peer.id === partner.id) || null : null;
    // The others stay remembered: they are offered once this route is over.
    journeyRating.keepWaiting(remembered.filter((w) => w !== waiting));
    if (!partner) return { partner: null, tripId: myTripId };
    if (USE_MOCKS || !isRealUserId(partner.id)) return { partner, tripId: myTripId };
    if (journeyRating.wasOffered(partner.id)) return { partner: null, tripId: myTripId };
    const tripId = myTripId && myCompanions.includes(partner.id)
      ? myTripId
      : (waiting?.peer.id === partner.id ? waiting.tripId : null);
    if (!tripId) return { partner: null, tripId: myTripId };
    journeyRating.markOffered(partner.id);
    return { partner, tripId };
  },
};

/** A new agreement with someone starts a new journey: a rating can be due again. */
function onAgreementChange(): void {
  const stale = Object.keys(memory.offered).filter((id) => {
    const current = agreementWith(id);
    return current != null && current !== memory.offered[id].agreement;
  });
  if (!stale.length) return;
  const offered = { ...memory.offered };
  stale.forEach((id) => { delete offered[id]; });
  memory = { ...memory, offered };
  save();
}

if (typeof window !== 'undefined') window.addEventListener(AGREEMENT_EVENT, onAgreementChange);
