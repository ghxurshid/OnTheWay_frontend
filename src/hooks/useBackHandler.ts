import { useEffect, useRef } from 'react';
import { pushBack } from '@/services/backStack';

/** While `active`, Telegram's Back button / Escape runs `handler` (the latest
    one passed) — only for the top-most open layer. */
export function useBackHandler(handler: (() => void) | undefined, active = true): void {
  const ref = useRef(handler);
  ref.current = handler;
  const enabled = active && !!handler;
  useEffect(() => (enabled ? pushBack(() => ref.current?.()) : undefined), [enabled]);
}
