/* ════════════════════════════════════════════════════════════════
   useToastQueue — one-at-a-time transient notifications.
   ────────────────────────────────────────────────────────────────
   Presence events arrive in bursts (several walkers can join within the
   same second), so notifications cannot simply overwrite a single state
   slot: the earlier toast would be replaced mid-animation and the user
   would see a flicker instead of a message. This hook serialises them —
   one toast is shown at a time, the rest wait their turn, and each one
   gets a full enter → hold → exit cycle before the next slides in.

   Every timer lives in a useEffect that clears it on unmount and on any
   dependency change, so nothing keeps firing after the map screen goes.
   ════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PushNotif } from '@/models';

/** How long a toast stays fully visible (a notif may override via `duration`). */
export const TOAST_VISIBLE_MS = 4000;
/** Exit animation length — MUST match the `pushSlideOut` keyframe in global.css. */
export const TOAST_EXIT_MS = 280;
/**
 * Backlog cap. A burst of joins would otherwise queue minutes of toasts;
 * beyond this the OLDEST waiting message is dropped, because in a live map
 * the most recent arrivals are the ones worth surfacing.
 */
export const TOAST_MAX_QUEUE = 3;

export interface ToastQueue {
  /** The toast being displayed, or null when idle. */
  current: PushNotif | null;
  /** True while `current` plays its exit animation. */
  exiting: boolean;
  /** Enqueue a notification (shown immediately when nothing is on screen). */
  push: (n: PushNotif) => void;
  /** Start dismissing the current toast early (user tapped close / action). */
  dismiss: () => void;
  /** Drop the current toast and the whole backlog (e.g. on leaving the screen). */
  clear: () => void;
}

export function useToastQueue(visibleMs: number = TOAST_VISIBLE_MS): ToastQueue {
  const [current, setCurrent] = useState<PushNotif | null>(null);
  const [exiting, setExiting] = useState(false);
  const queueRef = useRef<PushNotif[]>([]);
  // Mirrors `current` for the event-handler path: `push` must decide whether a
  // toast is already on screen without reading state inside a setState updater
  // (updaters have to stay pure — StrictMode invokes them twice).
  const showingRef = useRef(false);

  // Hand over to the next toast once the outgoing one has finished animating.
  const advance = useCallback(() => {
    const next = queueRef.current.shift() || null;
    showingRef.current = !!next;
    setExiting(false);
    setCurrent(next);
  }, []);

  const push = useCallback((n: PushNotif) => {
    if (showingRef.current) {
      queueRef.current.push(n);
      if (queueRef.current.length > TOAST_MAX_QUEUE) queueRef.current.shift();
      return;
    }
    showingRef.current = true;
    setCurrent(n);
  }, []);

  const dismiss = useCallback(() => setExiting(true), []);

  const clear = useCallback(() => {
    queueRef.current = [];
    showingRef.current = false;
    setExiting(false);
    setCurrent(null);
  }, []);

  // Hold timer — runs only while a toast is fully visible.
  useEffect(() => {
    if (!current || exiting) return undefined;
    const id = setTimeout(() => setExiting(true), current.duration || visibleMs);
    return () => clearTimeout(id);
  }, [current, exiting, visibleMs]);

  // Exit timer — waits out the slide-up, then pulls the next from the queue.
  useEffect(() => {
    if (!exiting) return undefined;
    const id = setTimeout(advance, TOAST_EXIT_MS);
    return () => clearTimeout(id);
  }, [exiting, advance]);

  return { current, exiting, push, dismiss, clear };
}
