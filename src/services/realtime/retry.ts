/* ════════════════════════════════════════════════════════════════
   Shared by the outboxes (agreement, walker alert, trip): which failures
   are final, and a backoff for the rest.
   ════════════════════════════════════════════════════════════════ */

/** True when the server answered the invocation with a refusal (a HubException, an
    unknown method, arguments it cannot bind) — final, sending it again changes nothing.
    Anything else while the socket is up (a server fault, a timeout) is worth a retry. */
export const isHubRefusal = (e: unknown): boolean =>
  /HubException|Failed to invoke/.test((e as Error | null)?.message || '');

const DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

/** Runs `run` again later, each time a little later (the last delay repeats), until
    `reset` — call it once everything went through. One timer at a time. */
export function createBackoff(run: () => void, delays: readonly number[] = DELAYS_MS) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  return {
    schedule(): void {
      if (timer) return;
      const delay = delays[Math.min(attempt, delays.length - 1)];
      attempt += 1;
      timer = setTimeout(() => { timer = null; run(); }, delay);
    },
    reset(): void {
      attempt = 0;
      if (timer) { clearTimeout(timer); timer = null; }
    },
  };
}
