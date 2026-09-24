import { UNREAD_EVENT, unreadStore } from '@/services/unreadStore';
import { useStoreEvent } from './useStoreEvent';

/** Live map of unread counts per contact/walker id. */
export const useUnread = () => useStoreEvent(UNREAD_EVENT, unreadStore.map);
