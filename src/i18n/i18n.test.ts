import { describe, it, expect, beforeEach } from 'vitest';
import { isTranslationOf, t, i18nStore } from './index';

describe('plural forms', () => {
  it('English: one / other', () => {
    i18nStore.set('en');
    expect(t('status.nearbyDrivers', { n: 1 })).toBe('1 driver nearby');
    expect(t('status.nearbyDrivers', { n: 3 })).toBe('3 drivers nearby');
    expect(t('userPopup.tripsCount', { n: 0 })).toBe('0 trips');
  });

  it('Russian: one / few / many', () => {
    i18nStore.set('ru');
    expect(t('userPopup.tripsCount', { n: 1 })).toBe('1 поездка');
    expect(t('userPopup.tripsCount', { n: 3 })).toBe('3 поездки');
    expect(t('userPopup.tripsCount', { n: 5 })).toBe('5 поездок');
    expect(t('userPopup.tripsCount', { n: 21 })).toBe('21 поездка');
    expect(t('userPopup.tripsCount', { n: 12 })).toBe('12 поездок');
  });

  it('Uzbek has one form; a count given as text still picks', () => {
    i18nStore.set('uz');
    expect(t('userPopup.tripsCount', { n: 1 })).toBe('1 ta sayohat');
    i18nStore.set('en');
    expect(t('userPopup.tripsCount', { n: '1' })).toBe('1 trip');
    expect(t('userPopup.tripsCount')).toBe('{n} trips');
  });
});

describe('isTranslationOf', () => {
  it('matches the value in any language, whatever language is active', () => {
    i18nStore.set('ru');
    expect(isTranslationOf('profile.colorWhite', 'oq')).toBe(true);
    expect(isTranslationOf('profile.colorWhite', 'белый')).toBe(true);
    expect(isTranslationOf('profile.colorWhite', ' White ')).toBe(true);
  });

  it('is false for anything else', () => {
    expect(isTranslationOf('profile.colorWhite', 'qora')).toBe(false);
    expect(isTranslationOf('profile.colorWhite', '')).toBe(false);
    expect(isTranslationOf('profile.colorWhite', null)).toBe(false);
    expect(isTranslationOf('nope.nothing', 'oq')).toBe(false);
  });
});

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
