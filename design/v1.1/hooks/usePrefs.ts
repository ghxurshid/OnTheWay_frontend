import { useStoreEvent } from './useStoreEvent';
import { PREFS_EVENT, prefsStore } from '@/services/prefsStore';
import type { Prefs } from '@/services/prefsStore';

/** Live view of the client preferences (re-renders on every change). */
export const usePrefs = (): Prefs => useStoreEvent(PREFS_EVENT, prefsStore.get);
