import { SAVED_EVENT, savedStore } from '@/services/savedStore';
import { useStoreEvent } from './useStoreEvent';

/** Live list of saved items. */
export const useSaved = () => useStoreEvent(SAVED_EVENT, savedStore.list);
