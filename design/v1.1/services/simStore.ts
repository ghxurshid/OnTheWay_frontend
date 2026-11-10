/* SERVICE — number of nearby walkers to simulate (N) (localStorage).
   Emits SIM_COUNT_EVENT so the map regenerates the simulation. */

import { notifyStoreChange, readJson, writeJson } from '@/utils/storage';

const SIM_KEY = 'ontheway_n';
export const SIM_COUNT_EVENT = 'ontheway:simcount';
export const SIM_COUNT = { min: 1, max: 10, default: 5 } as const;

const clamp = (n: number): number => Math.min(SIM_COUNT.max, Math.max(SIM_COUNT.min, Math.trunc(n)));

export const simStore = {
  get: (): number => {
    const v = Number(readJson<unknown>(SIM_KEY, SIM_COUNT.default));
    return Number.isFinite(v) ? clamp(v) : SIM_COUNT.default;
  },
  set: (n: number): void => {
    writeJson(SIM_KEY, clamp(n));
    notifyStoreChange(SIM_COUNT_EVENT);
  },
};
