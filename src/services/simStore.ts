/* SERVICE — number of nearby walkers to simulate (N, 1..10) (localStorage).
   Emits 'ontheway:simcount' so the map regenerates the simulation. */

const SIM_KEY = 'ontheway_n';

export const simStore = {
  get: (): number => {
    const v = parseInt(localStorage.getItem(SIM_KEY) || '5', 10);
    return isNaN(v) ? 5 : Math.min(10, Math.max(1, v));
  },
  set: (n: number): void => {
    const clamped = Math.min(10, Math.max(1, n | 0));
    localStorage.setItem(SIM_KEY, String(clamped));
    window.dispatchEvent(new Event('ontheway:simcount'));
  },
};
