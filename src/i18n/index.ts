/* ════════════════════════════════════════════════════════════════
   i18n — t() lookup + language store (same API shape as themeStore)
   ────────────────────────────────────────────────────────────────
   Components call only `t('namespace.key')` / `t('key', { n: 5 })`.
   Language switching: i18nStore.set('ru') / .subscribe(fn) / .mode.
   `I18nProvider` (contexts/) wraps this store for a React re-render seam.
   ════════════════════════════════════════════════════════════════ */

import { STRINGS } from './strings';

export type Lang = 'uz' | 'ru' | 'en';

export interface LangOption { id: Lang; label: string; }

export const I18N_LANGS: LangOption[] = [
  { id: 'uz', label: "O'zbek" },
  { id: 'ru', label: 'Русский' },
  { id: 'en', label: 'English' },
];
const DEFAULT_LANG: Lang = 'uz';

function read(): string | null {
  try { return localStorage.getItem('otw-lang'); } catch { return null; }
}

export const i18nStore = {
  mode: (read() || DEFAULT_LANG) as Lang,
  langs: I18N_LANGS,
  listeners: new Set<(mode: Lang) => void>(),
  apply() {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', this.mode);
    }
  },
  set(mode: Lang) {
    this.mode = mode;
    try { localStorage.setItem('otw-lang', mode); } catch { /* ignore */ }
    this.apply();
    this.listeners.forEach((l) => l(mode));
  },
  subscribe(fn: (mode: Lang) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
};
i18nStore.apply();

type StringNode = Record<Lang, string>;

function lookup(path: string): StringNode | null {
  const parts = path.split('.');
  let node: unknown = STRINGS;
  for (const p of parts) {
    if (node == null || typeof node !== 'object') return null;
    node = (node as Record<string, unknown>)[p];
    if (node == null) return null;
  }
  return node as StringNode;
}

/** Translate `path` in the active language, substituting `{token}` vars. */
export function t(path: string, vars?: Record<string, unknown>): string {
  const node = lookup(path);
  if (!node) return path; // missing → echo the key (debug aid)
  let str: string | undefined = node[i18nStore.mode];
  if (str == null) str = node[DEFAULT_LANG];
  if (str == null) return path;
  if (vars) {
    str = str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  }
  return str;
}
