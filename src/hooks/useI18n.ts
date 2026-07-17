import { useState, useEffect } from 'react';
import { t, i18nStore, I18N_LANGS } from '@/i18n';
import type { Lang } from '@/i18n';

/**
 * Subscribe to the language store and re-render on change.
 * Returns `t`, the active language, the language list, and a setter.
 */
export function useI18n() {
  const [lang, setLang] = useState<Lang>(i18nStore.mode);
  useEffect(() => i18nStore.subscribe(setLang), []);
  return {
    t,
    lang,
    langs: I18N_LANGS,
    setLang: (id: Lang) => i18nStore.set(id),
  };
}
