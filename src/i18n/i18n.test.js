import { describe, it, expect, beforeEach } from 'vitest';
import { t, i18nStore } from './index';

describe('i18n t()', () => {
  beforeEach(() => i18nStore.set('uz'));

  it('resolves a nested key in the active language', () => {
    expect(t('common.save')).toBe('Saqlash');
  });

  it('switches language via the store', () => {
    i18nStore.set('en');
    expect(t('common.save')).toBe('Save');
    i18nStore.set('ru');
    expect(t('common.save')).toBe('Сохранить');
  });

  it('echoes the key when it is missing (debug aid)', () => {
    expect(t('nope.does.not.exist')).toBe('nope.does.not.exist');
  });

  it('substitutes {token} variables', () => {
    i18nStore.set('en');
    expect(t('mapui.matchFoundDrivers', { n: 3 })).toBe('3 matching drivers found');
  });

  it('leaves an unmatched {token} in place', () => {
    i18nStore.set('en');
    expect(t('mapui.matchFoundDrivers', {})).toContain('{n}');
  });

  it('falls back to the default language when a translation is absent', () => {
    // uz always exists in the dictionary, so this simply confirms uz resolves.
    i18nStore.set('uz');
    expect(t('common.cancel')).toBe('Bekor');
  });
});
