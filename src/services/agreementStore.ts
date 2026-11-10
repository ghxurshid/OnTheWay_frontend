/* ════════════════════════════════════════════════════════════════
   AGREEMENT STORE — the "ride together" agreements, as the app shows them.
   ────────────────────────────────────────────────────────────────
   Two kinds live here:
   • Server agreements — formed when both sides confirmed in a call. The
     server keeps them as session state (they survive a reload, a reconnect
     and another device) and pushes every change; agreementService hydrates
     this store from it. A user may hold more than one (newest first).
   • One local agreement — an offer still waiting for an answer ('pending'),
     a demo walker's agreement, or a just-confirmed one the server has not
     echoed yet. A server agreement with the same person replaces it.

   `get()` is the one the map card, chat header and trip summary show: the
   local one if any, else the newest server one. `status` is from this
   user's side: 'arrived' once *I* said I am at the pick-up; the other
   person's arrival is `peerArrived`.
   ════════════════════════════════════════════════════════════════ */

import { notifyStoreChange } from '@/utils/storage';
import { initialsOf } from '@/utils/avatar';
import { idOf } from '@/utils/ids';
import type { LatLng, PartyType } from '@/models';

export type AgreementStatus = 'pending' | 'agreed' | 'arrived';

/** The other person as the agreement shows them. */
export interface AgreementPeer {
  id: string;
  name: string;
  initials: string;
  type: PartyType;
  vehicle?: string | null;
  latlng?: LatLng | null;
  photoUrl?: string | null;
}

export interface Agreement {
  peer: AgreementPeer;
  status: AgreementStatus;
  since: number;
  /** The server's id; absent while the agreement is local only. */
  id?: string;
  /** The other person said they are at the pick-up point. */
  peerArrived?: boolean;
  /** The server's version — an older copy arriving late is ignored. */
  version?: number;
}

/** An agreement as the presence hub sends it (AgreementDto). */
export interface AgreementDto {
  id: string;
  peer: { userId: string; name: string; type: string; vehicle?: string | null; photoUrl?: string | null };
  status: string;
  arrivedBy?: string[];
  sinceUtc?: string;
  version?: number;
}

export const AGREEMENT_EVENT = 'ontheway:agreement';

/** How many ended ids are remembered (to ignore a stale copy of them). */
const ENDED_MEMORY = 50;

let local: Agreement | null = null;
let server: Agreement[] = [];
const ended: string[] = [];
let current: Agreement | null = null;

/** The hub's DTO in the app's shape. */
export function toAgreement(dto: AgreementDto): Agreement {
  const peerId = idOf(dto.peer.userId);
  const arrivedBy = (dto.arrivedBy || []).map(idOf);
  const name = dto.peer.name || '';
  const since = dto.sinceUtc ? Date.parse(dto.sinceUtc) : NaN;
  return {
    id: idOf(dto.id),
    peer: {
      id: peerId, name, initials: initialsOf(name),
      type: dto.peer.type === 'driver' ? 'driver' : 'passenger',
      vehicle: dto.peer.vehicle || null, photoUrl: dto.peer.photoUrl || null,
    },
    status: arrivedBy.some((id) => id !== peerId) ? 'arrived' : 'agreed',
    peerArrived: arrivedBy.includes(peerId),
    since: Number.isFinite(since) ? since : Date.now(),
    version: dto.version ?? 0,
  };
}

const newestFirst = (a: Agreement, b: Agreement) => b.since - a.since;

function commit(): void {
  // A confirmed (non-pending) local copy gives way to the server's agreement with that person.
  if (local && local.status !== 'pending' && server.some((s) => s.peer.id === local!.peer.id)) local = null;
  server = [...server].sort(newestFirst);
  current = local || server[0] || null;
  notifyStoreChange(AGREEMENT_EVENT);
}

const remember = (id: string) => {
  if (ended.includes(id)) return;
  ended.push(id);
  if (ended.length > ENDED_MEMORY) ended.shift();
};

export const agreementStore = {
  /** The agreement on screen (null when none). Stable between changes. */
  get(): Agreement | null { return current; },
  /** Every agreement: the local one first, then the server's, newest first. */
  all(): Agreement[] { return local ? [local, ...server] : [...server]; },
  /** The server's agreements only. */
  serverAgreements(): Agreement[] { return server; },
  byId(id: string): Agreement | null { return server.find((a) => a.id === id) || null; },

  // --- the local agreement (pending offer, demo walker, not yet echoed) ---
  set(next: Agreement | null): void { local = next; commit(); },
  patch(p: Partial<Agreement>): void { if (local) { local = { ...local, ...p }; commit(); } },
  clear(): void { if (local) { local = null; commit(); } },
  local(): Agreement | null { return local; },

  // --- server agreements (driven by agreementService) ---

  /** Replace the server agreements with a snapshot (GetAgreements). Returns the
      ones that were here but are gone now — they ended while we were away. */
  hydrate(dtos: AgreementDto[]): Agreement[] {
    const next = dtos.map(toAgreement).filter((a) => !ended.includes(a.id!));
    const gone = server.filter((a) => !next.some((n) => n.id === a.id));
    gone.forEach((a) => remember(a.id!));
    server = next;
    commit();
    return gone;
  },

  /** Add or update one agreement (AgreementUpdated). Returns it with the copy
      it replaced, or null when it is stale (older version, already ended). */
  upsert(dto: AgreementDto): { agreement: Agreement; previous: Agreement | null } | null {
    const agreement = toAgreement(dto);
    if (ended.includes(agreement.id!)) return null;
    const previous = server.find((a) => a.id === agreement.id) || null;
    if (previous && (previous.version ?? 0) >= (agreement.version ?? 0)) return null;
    // What I did myself and the server has not echoed yet stays applied.
    if (previous?.status === 'arrived') agreement.status = 'arrived';
    server = [...server.filter((a) => a.id !== agreement.id), agreement];
    commit();
    return { agreement, previous };
  },

  /** Drop a server agreement (ended here or by the server). Returns it, or null
      when it was not here. A later stale copy of it is ignored. */
  remove(id: string): Agreement | null {
    remember(id);
    const gone = server.find((a) => a.id === id) || null;
    if (gone) { server = server.filter((a) => a.id !== id); commit(); }
    return gone;
  },

  /** Apply my own "I'm here" before the server confirms it. */
  markArrived(id: string): void {
    const at = server.findIndex((a) => a.id === id);
    if (at < 0 || server[at].status === 'arrived') return;
    server = server.map((a, i) => (i === at ? { ...a, status: 'arrived' } : a));
    commit();
  },

  /** Forget everything (sign-out, tests). */
  reset(): void { local = null; server = []; ended.length = 0; commit(); },
};
