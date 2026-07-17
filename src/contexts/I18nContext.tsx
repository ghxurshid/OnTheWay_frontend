/* ════════════════════════════════════════════════════════════════
   I18nProvider — the single React re-render seam for the language store.
   Components call the imported `t()` directly; this provider subscribes
   once at the root and re-renders the whole tree on language change.
   ════════════════════════════════════════════════════════════════ */

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { t, i18nStore, I18N_LANGS } from '@/i18n';
import type { Lang, LangOption } from '@/i18n';

interface I18nContextValue {
  t: typeof t;
  lang: Lang;
  langs: LangOption[];
  setLang: (id: Lang) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(i18nStore.mode);
  useEffect(() => i18nStore.subscribe(setLang), []);
  const value: I18nContextValue = {
    t,
    lang,
    langs: I18N_LANGS,
    setLang: (id: Lang) => i18nStore.set(id),
  };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18nContext(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18nContext must be used within <I18nProvider>');
  return ctx;
}
