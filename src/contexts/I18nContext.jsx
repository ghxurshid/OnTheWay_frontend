/* ════════════════════════════════════════════════════════════════
   I18nProvider — the single React re-render seam for the language store.
   Components call the imported `t()` directly; this provider subscribes
   once at the root and re-renders the whole tree on language change.
   ════════════════════════════════════════════════════════════════ */

import { createContext, useContext, useEffect, useState } from 'react';
import { t, i18nStore, I18N_LANGS } from '@/i18n';

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(i18nStore.mode);
  useEffect(() => i18nStore.subscribe(setLang), []);
  const value = {
    t,
    lang,
    langs: I18N_LANGS,
    setLang: (id) => i18nStore.set(id),
  };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18nContext() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18nContext must be used within <I18nProvider>');
  return ctx;
}
