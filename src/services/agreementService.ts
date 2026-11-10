/* ════════════════════════════════════════════════════════════════
   SERVICE — the "ride together" agreement, kept in step with the server.
   ────────────────────────────────────────────────────────────────
   The server holds each agreement as session state (formed by the in-call
   handshake) and pushes every change over the presence hub:
   AgreementUpdated (formed / someone arrived) and AgreementEnded (cancelled,
   completed, blocked, expired). This service:
   • mirrors them into agreementStore, and catches up after every
     (re)connect with GetAgreements — what ended while we were away is
     reported as "ended";
   • sends my own actions — cancel, "I'm here", journey completed — through
     a small persisted outbox: applied on screen at once, delivered when the
     socket is up (also after a restart). The hub methods are idempotent and
     name the agreement by id, so a replay never touches a newer one;
   • tells the UI about the OTHER person's actions (onPeerEvent → toasts);
   • keeps the local companion list honest: whoever an agreement ended with
     (called off, blocked, expired, or gone while we were away) is not a
     companion of my journey any more.
   A command is dropped only when the server refuses it; a server fault while
   the socket is up is retried with a backoff (the change is already on screen
   and the other person must hear about it).
   Demo walkers and offers still waiting for an answer stay local only.
   ════════════════════════════════════════════════════════════════ */

import type { HubConnection } from '@microsoft/signalr';
import { presenceClient } from '@/services/realtime';
import { createBackoff, isHubRefusal } from '@/services/realtime/retry';
import { AGREEMENT_EVENT, agreementStore } from '@/services/agreementStore';
import type { Agreement, AgreementDto, AgreementPeer } from '@/services/agreementStore';
import { BLOCK_EVENT, blockStore } from '@/services/blockStore';
import { forgetCompanion } from '@/services/liveTripService';
import { readJson, writeJson } from '@/utils/storage';
import { idOf } from '@/utils/ids';

const KEY = 'ontheway_agreement_outbox_v1';

type CommandKind = 'cancel' | 'complete' | 'arrived';
interface Command { kind: CommandKind; id: string }

const METHOD: Record<CommandKind, string> = {
  cancel: 'CancelAgreement', complete: 'CompleteAgreement', arrived: 'MarkArrived',
};

/** Why the server said an agreement ended. */
export type AgreementEndReason = 'cancelled' | 'completed' | 'blocked' | 'expired' | string;

interface AgreementEndedDto { agreementId: string; peerId: string; reason: AgreementEndReason; byUserId?: string | null }

/** Something the other person (or the server) did to an agreement. */
export type PeerEvent =
  | { kind: 'cancelled'; agreement: Agreement }
  | { kind: 'arrived'; agreement: Agreement }
  | { kind: 'ended'; agreement: Agreement; reason: AgreementEndReason };

let queue: Command[] = readJson<Command[]>(KEY, []);
const save = () => writeJson(KEY, queue.length ? queue : null);
const listeners = new Set<(e: PeerEvent) => void>();

function emit(event: PeerEvent): void {
  listeners.forEach((fn) => { try { fn(event); } catch (e) { console.error('[agreement]', e); } });
}

function enqueue(command: Command): void {
  if (command.kind === 'arrived') {
    // Sent once — and pointless when the agreement is ending anyway.
    if (queue.some((q) => q.id === command.id)) { flush(); return; }
    queue = [...queue, command];
  } else {
    // Ending supersedes whatever was queued for that agreement.
    queue = [...queue.filter((q) => q.id !== command.id), command];
  }
  save();
  flush();
}

let flushing: Promise<void> | null = null;
let again = false;
const retry = createBackoff(() => { flush(); });

/** Send what is queued, oldest first, over `conn` (default: the live connection).
    Stops when the socket drops (the next connect resumes); a refused command is
    dropped; any other failure is retried later. */
function flush(conn?: HubConnection): Promise<void> {
  if (flushing) { again = true; return flushing; }
  flushing = (async () => {
    while (queue.length) {
      const c = conn && conn.state === 'Connected' ? conn : presenceClient.connection();
      if (!c) return;
      const head = queue[0];
      try {
        await c.invoke(METHOD[head.kind], head.id);
      } catch (e) {
        if (c.state !== 'Connected') return; // lost mid-way: the next connect retries it
        if (!isHubRefusal(e)) { retry.schedule(); return; } // a server fault: try again soon
        // Refused (an older server without the method, a bad id): nothing more to do.
      }
      queue = queue.filter((q) => q !== head);
      save();
    }
    retry.reset();
  })().finally(() => {
    flushing = null;
    if (again) { again = false; flush(); }
  });
  return flushing;
}

/** After a (re)connect: deliver what was queued, then take the server's list. */
async function catchUp(conn: HubConnection): Promise<void> {
  await flush(conn);
  let list: AgreementDto[] | null;
  try {
    list = await conn.invoke<AgreementDto[]>('GetAgreements');
  } catch (e) {
    if (conn.state !== 'Connected') throw e;
    return; // an older server: keep what we have
  }
  // Commands still queued (the flush was cut short) stay applied over the snapshot.
  const pendingEnd = new Set(queue.filter((q) => q.kind !== 'arrived').map((q) => q.id));
  const pendingArrive = new Set(queue.filter((q) => q.kind === 'arrived').map((q) => q.id));
  const gone = agreementStore.hydrate((list || []).filter((a) => !pendingEnd.has(idOf(a.id))));
  pendingArrive.forEach((id) => agreementStore.markArrived(id));
  gone.forEach((agreement) => {
    forgetCompanion(agreement.peer.id); // whatever ended it, there is no journey together now
    emit({ kind: 'ended', agreement, reason: 'ended' });
  });
}

function onUpdated(dto: AgreementDto): void {
  if (!dto?.id) return;
  const change = agreementStore.upsert(dto);
  if (change?.agreement.peerArrived && !change.previous?.peerArrived) emit({ kind: 'arrived', agreement: change.agreement });
}

function onEnded(evt: AgreementEndedDto): void {
  if (!evt?.agreementId) return;
  const id = idOf(evt.agreementId);
  queue = queue.filter((q) => q.id !== id);
  save();
  const agreement = agreementStore.remove(id);
  if (!agreement) return; // ended here (optimistically) — nothing to tell
  // Called off, blocked or expired: not a companion of my journey. A completed one
  // stays — the journey happened, and my own finish records it.
  if (evt.reason !== 'completed') forgetCompanion(agreement.peer.id);
  const by = evt.byUserId != null ? idOf(evt.byUserId) : null;
  if (by && by !== agreement.peer.id) return; // my own doing, on another device
  if (evt.reason === 'cancelled') emit({ kind: 'cancelled', agreement });
  else emit({ kind: 'ended', agreement, reason: evt.reason });
}

/** Blocking someone ends what is still local with them (a pending offer, a demo
    walker); a server agreement is ended by the server, which tells both. */
function onBlocked(): void {
  const l = agreementStore.local();
  if (l && blockStore.has(l.peer.id)) agreementStore.clear();
}

presenceClient.on('AgreementUpdated', onUpdated);
presenceClient.on('AgreementEnded', onEnded);
presenceClient.onResync(catchUp);
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { flush(); });
  window.addEventListener(BLOCK_EVENT, onBlocked);
}

/** The local agreement, if it is the one with `peerId`. */
const localWith = (peerId: string): Agreement | null => {
  const l = agreementStore.local();
  return l && l.peer.id === peerId ? l : null;
};

/** End one agreement from this side: a local one just goes, a server one is
    sent (unless it is over already). */
function end(agreement: Agreement, kind: 'cancel' | 'complete'): void {
  if (kind === 'cancel') forgetCompanion(agreement.peer.id);
  if (!agreement.id) {
    if (localWith(agreement.peer.id)) agreementStore.clear();
    return;
  }
  if (!agreementStore.remove(agreement.id)) return;
  enqueue({ kind, id: agreement.id });
}

export const agreementService = {
  /** Call off `agreement` (default: the one on screen). Returns it, or null
      when there was none. */
  cancel(agreement: Agreement | null = agreementStore.get()): Agreement | null {
    if (agreement) end(agreement, 'cancel');
    return agreement;
  },

  /** "I'm here" for `agreement` (default: the one on screen). Returns the
      updated agreement, or null when there is none to mark. */
  markArrived(agreement: Agreement | null = agreementStore.get()): Agreement | null {
    if (!agreement || agreement.status === 'pending') return null;
    if (!agreement.id) {
      if (!localWith(agreement.peer.id)) return null;
      agreementStore.patch({ status: 'arrived' });
      return agreementStore.local();
    }
    if (!agreementStore.byId(agreement.id)) return null; // over already
    agreementStore.markArrived(agreement.id);
    enqueue({ kind: 'arrived', id: agreement.id });
    return agreementStore.byId(agreement.id);
  },

  /** The journey is over: every agreement ends as completed. */
  complete(): void { agreementStore.all().forEach((a) => end(a, 'complete')); },

  /** Leaving the map / switching role: every agreement is called off. */
  cancelAll(): void { agreementStore.all().forEach((a) => end(a, 'cancel')); },

  /** Both sides confirmed in a call: show it now. The server's copy (pushed to
      every device of both) replaces it; demo calls stay local only. */
  agreedInCall(peer: AgreementPeer): void {
    const peerId = idOf(peer.id);
    if (agreementStore.serverAgreements().some((a) => a.peer.id === peerId)) {
      if (localWith(peerId)) agreementStore.clear(); // e.g. our "pending" offer to them
      return;
    }
    agreementStore.set({ peer: { ...peer, id: peerId }, status: 'agreed', since: Date.now() });
  },

  /** Resolves true once the server holds an agreement with `peerId` (at once if it
      does already), false after `timeoutMs`. A real call's "ride together" counts
      only then: an accepted offer the server did not turn into an agreement (none
      was made, it expired, a block) must not record a companion. */
  whenAgreedWith(peerId: string, timeoutMs = 10_000): Promise<boolean> {
    const id = idOf(peerId);
    const has = () => agreementStore.serverAgreements().some((a) => a.peer.id === id);
    if (has() || typeof window === 'undefined') return Promise.resolve(has());
    return new Promise((resolve) => {
      const done = (agreed: boolean) => {
        window.removeEventListener(AGREEMENT_EVENT, check);
        clearTimeout(timer);
        resolve(agreed);
      };
      const check = () => { if (has()) done(true); };
      const timer = setTimeout(() => done(false), timeoutMs);
      window.addEventListener(AGREEMENT_EVENT, check);
    });
  },

  /** The other person's (or the server's) actions, for toasts. Returns an unsubscribe. */
  onPeerEvent(fn: (e: PeerEvent) => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },

  /** Deliver queued commands now (e.g. back online). */
  flush: (): Promise<void> => flush(),
  /** Queued commands (tests / diagnostics). */
  pending: (): readonly Command[] => queue,
};
