import { describe, it, expect } from 'vitest';
import { STRINGS } from './strings';

// Every literal t('…') key in the source must exist in all three languages —
// a missing key is echoed to the user as raw text ("contacts.tabChats").
const sources = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

type Node = { [k: string]: Node | string };
const lookup = (path: string): Node | undefined =>
  path.split('.').reduce<Node | undefined>((n, k) => (n && typeof n[k] === 'object' ? (n[k] as Node) : undefined), STRINGS as unknown as Node);

describe('i18n keys', () => {
  it('every t() key used in the app is translated to uz, ru and en', () => {
    const missing: string[] = [];
    for (const [file, code] of Object.entries(sources)) {
      if (/\.test\.tsx?$/.test(file) || file.startsWith('./')) continue; // tests + the i18n module itself
      // Only whole literal keys: t('a.b') / t('a.b', vars) — not t('a.prefix' + x).
      for (const [, key] of code.matchAll(/\bt\(\s*'([a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)+)'\s*[,)]/g)) {
        const node = lookup(key);
        if (!node || ['uz', 'ru', 'en'].some((l) => typeof node[l] !== 'string')) missing.push(`${key} (${file})`);
      }
    }
    expect(missing).toEqual([]);
  });
});
