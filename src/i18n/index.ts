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
  subscribe(fn: (mode: Lang) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; },
};
i18nStore.apply();

/** Plural forms of one text, by CLDR category (see strings.ts). */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>>;
type Text = string | PluralForms;
type StringNode = Record<Lang, Text>;

const pluralRules = new Map<string, Intl.PluralRules>();
const rulesFor = (lang: Lang): Intl.PluralRules => {
  let rules = pluralRules.get(lang);
  if (!rules) { rules = new Intl.PluralRules(lang); pluralRules.set(lang, rules); }
  return rules;
};

/** The form of `text` for count `n` in `lang` (a plain string is every form). */
function pickForm(text: Text | undefined, lang: Lang, n: unknown): string | undefined {
  if (text == null || typeof text === 'string') return text;
  const count = Number(n);
  const category = Number.isFinite(count) ? rulesFor(lang).select(count) : 'other';
  return text[category] ?? text.other ?? text.many ?? Object.values(text)[0];
}

/** Every wording of a node (each language, each plural form). */
const allTexts = (node: StringNode): string[] =>
  Object.values(node).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v).filter((x): x is string => typeof x === 'string')));

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

/** True when `text` is what `path` says in ANY language (ignoring case and
    outer spaces): a value stored in the language it was picked in still matches
    after the user switches language. */
export function isTranslationOf(path: string, text: string | null | undefined): boolean {
  const node = lookup(path);
  const wanted = (text || '').trim().toLowerCase();
  return !!node && !!wanted && allTexts(node).some((v) => v.toLowerCase() === wanted);
}

/** Translate `path` in the active language, substituting `{token}` vars. A
    text with plural forms takes the one for `vars.n`. */
export function t(path: string, vars?: Record<string, unknown>): string {
  const node = lookup(path);
  if (!node) return path; // missing → echo the key (debug aid)
  const lang = node[i18nStore.mode] != null ? i18nStore.mode : DEFAULT_LANG;
  let str: string | undefined = pickForm(node[lang], lang, vars?.n);
  if (str == null) return path;
  if (vars) {
    str = str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  }
  return str;
}
