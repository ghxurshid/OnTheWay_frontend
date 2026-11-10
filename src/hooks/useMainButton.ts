import { useEffect, useRef } from 'react';
import { mainButton } from '@/services/telegram';

/**
 * Put a screen's primary action on Telegram's native bottom button.
 * Returns true when the native button is in use — the screen then hides its
 * own in-page button (outside Telegram it returns false and nothing changes).
 */
export function useMainButton(text: string, onClick: () => void, { visible = true, enabled = true, busy = false } = {}): boolean {
  const mb = mainButton();
  const handlerRef = useRef(onClick);
  handlerRef.current = onClick;

  useEffect(() => {
    if (!mb || !visible) return undefined;
    const fire = () => handlerRef.current();
    try {
      mb.setText?.(text);
      if (enabled) mb.enable?.(); else mb.disable?.();
      if (busy) mb.showProgress?.(false); else mb.hideProgress?.();
      mb.onClick?.(fire);
      mb.show?.();
    } catch { /* older clients */ }
    return () => {
      try { mb.offClick?.(fire); mb.hideProgress?.(); mb.hide?.(); } catch { /* ignore */ }
    };
  }, [mb, text, visible, enabled, busy]);

  return !!mb && visible;
}
