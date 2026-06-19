/* ════════════════════════════════════════════════════════════════
   i18n — t() lookup + language store (same API shape as themeStore)
   ────────────────────────────────────────────────────────────────
   Components call only `t('namespace.key')` / `t('key', { n: 5 })`.
   Language switching: i18nStore.set('ru') / .subscribe(fn) / .mode.
   `I18nProvider` (contexts/) wraps this store for a React re-render seam.
   ════════════════════════════════════════════════════════════════ */

import { STRINGS } from './strings';

export const I18N_LANGS = [
  { id: 'uz', label: "O'zbek" },
  { id: 'ru', label: 'Русский' },
  { id: 'en', label: 'English' },
];
const DEFAULT_LANG = 'uz';

function read() {
  try { return localStorage.getItem('otw-lang'); } catch (e) { return null; }
}

export const i18nStore = {
  mode: read() || DEFAULT_LANG,
  langs: I18N_LANGS,
  listeners: new Set(),
  apply() {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', this.mode);
    }
  },
  set(mode) {
    this.mode = mode;
    try { localStorage.setItem('otw-lang', mode); } catch (e) { /* ignore */ }
    this.apply();
    this.listeners.forEach((l) => l(mode));
  },
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
};
i18nStore.apply();

function lookup(path) {
  const parts = path.split('.');
  let node = STRINGS;
  for (const p of parts) { node = node && node[p]; if (node == null) return null; }
  return node;
}

/** Translate `path` in the active language, substituting `{token}` vars. */
export function t(path, vars) {
  const node = lookup(path);
  if (!node) return path; // missing → echo the key (debug aid)
  let str = node[i18nStore.mode];
  if (str == null) str = node[DEFAULT_LANG];
  if (str == null) return path;
  if (vars) {
    str = str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  }
  return str;
}

export { STRINGS };
