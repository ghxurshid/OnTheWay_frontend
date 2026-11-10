import { useStoreEvent } from './useStoreEvent';
import { WALKER_ALERT_EVENT, walkerAlertService } from '@/services/walkerAlertService';

/** Whether "tell me when someone appears" is on. */
export const useWalkerAlert = (): boolean => useStoreEvent(WALKER_ALERT_EVENT, walkerAlertService.isOn);
