/* ════════════════════════════════════════════════════════════════
   AGREEMENT STORE — the "ride together" agreement in progress.
   One at a time: an offer that is waiting for an answer ('pending'), an
   agreed ride ('agreed'), and the moment the user said they are at the
   pick-up ('arrived'). The map card, chat header and trip summary read it
   through `useAgreement`. In-memory (a reload starts clean — the server
   keeps the companion on the trip itself).
   ════════════════════════════════════════════════════════════════ */

import { notifyStoreChange } from '@/utils/storage';
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
}

export interface Agreement { peer: AgreementPeer; status: AgreementStatus; since: number }

export const AGREEMENT_EVENT = 'ontheway:agreement';

let current: Agreement | null = null;

export const agreementStore = {
  get(): Agreement | null { return current; },
  set(next: Agreement | null): void { current = next; notifyStoreChange(AGREEMENT_EVENT); },
  patch(p: Partial<Agreement>): void { if (current) agreementStore.set({ ...current, ...p }); },
  clear(): void { agreementStore.set(null); },
};
