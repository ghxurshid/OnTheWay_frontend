import { SIM_COUNT_EVENT, simStore } from '@/services/simStore';
import { useStoreEvent } from './useStoreEvent';

/** [n, setN] for the simulated-walker count. */
export const useSimCount = (): [number, (n: number) => void] =>
  [useStoreEvent(SIM_COUNT_EVENT, simStore.get), simStore.set];
