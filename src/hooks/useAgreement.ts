import { useStoreEvent } from './useStoreEvent';
import { AGREEMENT_EVENT, agreementStore } from '@/services/agreementStore';
import type { Agreement } from '@/services/agreementStore';

/** The current ride-together agreement (null when none). */
export const useAgreement = (): Agreement | null => useStoreEvent(AGREEMENT_EVENT, agreementStore.get);
