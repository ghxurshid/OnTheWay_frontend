/* useEscapeKey — call `handler` when Escape is pressed while `active`.
   A small a11y primitive so dialogs/overlays are dismissible from the
   keyboard, not just by clicking the close button. */

import { useEffect } from 'react';

export function useEscapeKey(handler, active = true) {
  useEffect(() => {
    if (!active || typeof handler !== 'function') return undefined;
    const onKey = (e) => { if (e.key === 'Escape') handler(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handler, active]);
}
