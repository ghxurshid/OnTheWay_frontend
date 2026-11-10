/* ════════════════════════════════════════════════════════════════
   StoreRerender — re-renders the whole app when the language or the theme
   changes. Components read both straight from the global stores (`t()`,
   the `T` token object), so they only show a change when they render
   again. A provider re-rendering is not enough: React skips children whose
   elements did not change. Building the tree here, on every change, gives
   every component new elements — they all render again, nothing remounts
   (same component types and keys), so the map, open panels and form drafts
   stay as they are.
   ════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { i18nStore } from '@/i18n';
import { themeStore } from '@/constants/theme';

export function StoreRerender({ render }: { render: () => ReactNode }) {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const offLang = i18nStore.subscribe(bump);
    const offTheme = themeStore.subscribe(bump);
    return () => { offLang(); offTheme(); };
  }, []);
  return <>{render()}</>;
}
