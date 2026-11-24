import { describe, it, expect, beforeEach } from 'vitest';
import { i18nStore } from '@/i18n';
import { labelArea, localizePlace, shortAddress, shortPlaceName } from './placeName';
import type { AddressParts } from './placeName';

// Real Nominatim answers for Tashkent (2026-11-06), trimmed to what is read.
const STATION = {
  display_name: 'Amir Temur, Мустакиллик проспект, Буюк Ипак Йули (Ц-1), Мирзо-Улугбекский район, Ташкент, 100000, Узбекистан',
  address: { railway: 'Amir Temur', road: 'Мустакиллик проспект', neighbourhood: 'Буюк Ипак Йули (Ц-1)', district: 'Мирзо-Улугбекский район', city: 'Ташкент' } as AddressParts,
};
const MONUMENT = {
  display_name: 'Амир Тимур, Московская улица, Юнусабадский район, Кашгар махалля, 100000, Узбекистан',
  address: { historic: 'Амир Тимур', road: 'Московская улица', district: 'Юнусабадский район', city: 'Кашгар махалля' } as AddressParts,
};
const SHOP = {
  display_name: 'Корзинка, Ипакчи улица, Махалля Абу Али ибн Сина-1, Шайхантахурский район, Ташкент, 100000, Узбекистан',
  address: { shop: 'Корзинка', road: 'Ипакчи улица', residential: 'Махалля Абу Али ибн Сина-1', district: 'Шайхантахурский район', city: 'Ташкент' } as AddressParts,
};
const VILLAGE = {
  display_name: 'Амир Темур, Тилаабад, Чиназский район, Ташкентская область, Узбекистан',
  address: { village: 'Амир Темур', county: 'Чиназский район', state: 'Ташкентская область' } as AddressParts,
};
const BUILDING_LOCALITY = {
  display_name: '13/1, Chilonzor 9 kvartal, Чиланзар-9, Чиланзар, Чиланзарский район, Ташкент, 100097, Узбекистан',
  address: { house_number: '13/1', locality: 'Chilonzor 9 kvartal', neighbourhood: 'Чиланзар-9', suburb: 'Чиланзар', district: 'Чиланзарский район', city: 'Ташкент' } as AddressParts,
};
const BUILDING_BLOCK_10 = {
  display_name: '13/1, Чиланзар-10, Чиланзар, Чиланзарский район, Ташкент, 100000, Узбекистан',
  address: { house_number: '13/1', residential: 'Чиланзар-10', suburb: 'Чиланзар', district: 'Чиланзарский район', city: 'Ташкент' } as AddressParts,
};
const BUILDING_BLOCK_20 = {
  display_name: '13/1, Чиланзар-20, Чиланзар, Чиланзарский район, Ташкент, 100000, Узбекистан',
  address: { house_number: '13/1', residential: 'Чиланзар-20', suburb: 'Чиланзар', district: 'Чиланзарский район', city: 'Ташкент' } as AddressParts,
};
const STREET_REVERSE = {
  display_name: 'Srkver, Юнусабадский район, Кашгар махалля, 100000, Oʻzbekiston',
  address: { road: 'Srkver', district: 'Юнусабадский район', city: 'Кашгар махалля' } as AddressParts,
};
const STREET_WITH_NUMBER = {
  display_name: '12, Восита Вахидова улица, Мирабадский район, Ташкент, 100000, Узбекистан',
  address: { house_number: '12', road: 'Восита Вахидова улица', district: 'Мирабадский район', city: 'Ташкент' } as AddressParts,
};

const label = (p: { display_name: string; address: AddressParts }) => shortPlaceName(p.display_name, p.address);

describe('shortPlaceName', () => {
  describe('a named place keeps the name the user tapped, plus the area', () => {
    it('Russian UI: the original names', () => {
      i18nStore.set('ru');
      expect(label(STATION)).toBe('Amir Temur, Мирзо-Улугбекский район');
      expect(label(MONUMENT)).toBe('Амир Тимур, Юнусабадский район');
      expect(label(SHOP)).toBe('Корзинка, Шайхантахурский район');
    });

    it('Latin UI languages: localized', () => {
      i18nStore.set('uz');
      expect(label(STATION)).toMatch(/^Amir Temur, .* tumani$/);
      expect(label(SHOP)).toMatch(/^Korzinka, .* tumani$/);
      i18nStore.set('en');
      expect(label(MONUMENT)).toMatch(/^Amir Timur, .* District$/);
    });

    it('a village is named after itself: the next wider area, not the same word twice', () => {
      i18nStore.set('ru');
      expect(label(VILLAGE)).toBe('Амир Темур, Чиназский район');
    });

    it('with no area to add, says nothing (the caller uses the display name)', () => {
      i18nStore.set('ru');
      expect(shortPlaceName('Ташкент, Узбекистан', { city: 'Ташкент' })).toBeNull();
    });
  });

  describe('streets and addresses keep the short "Street, District" form', () => {
    it('a street', () => {
      i18nStore.set('ru');
      expect(label(STREET_REVERSE)).toBe('Srkver, Юнусабадский район');
    });

    it('a street and number', () => {
      i18nStore.set('ru');
      expect(label(STREET_WITH_NUMBER)).toBe('Восита Вахидова улица 12, Мирабадский район');
    });

    it('recognises its road after geocode() localized the display name', () => {
      i18nStore.set('uz');
      const localized = localizePlace(STREET_WITH_NUMBER.display_name.split(', ').slice(1).join(', '));
      expect(shortPlaceName(localized, { road: 'Восита Вахидова улица', district: 'Мирабадский район' }))
        .toMatch(/^Vosita Vaxidova koʻchasi, /);
    });
  });

  describe('a building with no road keeps its number', () => {
    it('with the nearest area, so different buildings get different labels', () => {
      i18nStore.set('ru');
      const labels = [label(BUILDING_LOCALITY), label(BUILDING_BLOCK_10), label(BUILDING_BLOCK_20)];
      expect(labels).toEqual(['Chilonzor 9 kvartal, 13/1', 'Чиланзар-10, 13/1', 'Чиланзар-20, 13/1']);
    });

    it('a Cyrillic-only name falls back to transliteration', () => {
      i18nStore.set('uz');
      expect(label(BUILDING_BLOCK_10)).toBe('Chilanzar-10, 13/1');
    });

    it('a bare number with no area says nothing', () => {
      expect(shortAddress({ house_number: '13/1' })).toBeNull();
    });
  });

  it('without address details says nothing', () => {
    expect(shortPlaceName('Amir Temur, Toshkent', undefined)).toBeNull();
    expect(shortPlaceName('Amir Temur, Toshkent', null)).toBeNull();
    expect(shortPlaceName('Amir Temur, Toshkent', {})).toBeNull();
  });
});

describe('shortAddress', () => {
  it('reads district and locality as areas', () => {
    i18nStore.set('ru');
    expect(shortAddress({ road: 'Ипакчи улица', district: 'Шайхантахурский район' })).toBe('Ипакчи улица, Шайхантахурский район');
    expect(shortAddress({ road: 'Ипакчи улица', locality: 'Chilonzor 9 kvartal' })).toBe('Ипакчи улица, Chilonzor 9 kvartal');
  });

  it('the wider area orients a street', () => {
    i18nStore.set('ru');
    expect(shortAddress({ road: 'Мустакиллик проспект', neighbourhood: 'Буюк Ипак Йули (Ц-1)', district: 'Мирзо-Улугбекский район' }))
      .toBe('Мустакиллик проспект, Мирзо-Улугбекский район');
  });
});

// Nominatim asked in the UI language only (namedetails, 2026-11-24): OSM's default
// `name` is Uzbek, `name:ru` / `name:en` usually exist, `name:uz` usually not.
const KICHIK_HALQA = {
  uz: { road: "Kichik Halqa yo'li", district: 'Chilonzor Tumani', city: 'Toshkent' },
  ru: { road: 'Малая кольцевая дорога', district: 'Чиланзарский район', city: 'Ташкент' },
  en: { road: 'Small Ring Road', district: 'Chilanzar district', city: 'Tashkent' },
} satisfies Record<'uz' | 'ru' | 'en', AddressParts>;
const QATORTOL = {
  uz: { road: "Qatortol ko'chasi", house_number: '12', district: 'Chilonzor Tumani' },
  ru: { road: 'Катартал улица', house_number: '12', district: 'Чиланзарский район' },
  en: { road: 'Katartal Street', house_number: '12', district: 'Chilanzar district' },
} satisfies Record<'uz' | 'ru' | 'en', AddressParts>;
const AMIR_TEMUR_AVENUE = {
  uz: { road: "Amir Temur shoh ko'chasi", district: 'Yunusobod Tumani' },
  en: { road: 'Amir Timur Avenue', district: 'Yunusabad district' },
} satisfies Record<'uz' | 'en', AddressParts>;

describe('names in the UI language are kept exactly as the geocoder gives them', () => {
  it('uz: the Uzbek default name', () => {
    i18nStore.set('uz');
    expect(shortAddress(KICHIK_HALQA.uz)).toBe("Kichik Halqa yo'li, Chilonzor Tumani");
    expect(shortAddress(QATORTOL.uz)).toBe("Qatortol ko'chasi 12, Chilonzor Tumani");
    expect(shortAddress(AMIR_TEMUR_AVENUE.uz)).toBe("Amir Temur shoh ko'chasi, Yunusobod Tumani");
  });

  it('en: the English name', () => {
    i18nStore.set('en');
    expect(shortAddress(KICHIK_HALQA.en)).toBe('Small Ring Road, Chilanzar district');
    expect(shortAddress(QATORTOL.en)).toBe('Katartal Street 12, Chilanzar district');
    expect(shortAddress(AMIR_TEMUR_AVENUE.en)).toBe('Amir Timur Avenue, Yunusabad district');
  });

  it('ru: the Russian name', () => {
    i18nStore.set('ru');
    expect(shortAddress(KICHIK_HALQA.ru)).toBe('Малая кольцевая дорога, Чиланзарский район');
    expect(shortAddress(QATORTOL.ru)).toBe('Катартал улица 12, Чиланзарский район');
  });

  it('a Latin label is never re-processed', () => {
    i18nStore.set('uz');
    expect(localizePlace("Kichik Halqa yo'li, Chilonzor Tumani")).toBe("Kichik Halqa yo'li, Chilonzor Tumani");
    i18nStore.set('en');
    expect(localizePlace('Kichik Halqa Ring Road, Chilanzar district')).toBe('Kichik Halqa Ring Road, Chilanzar district');
  });
});

describe('last resort: a place known only by a Cyrillic name', () => {
  it('is transliterated, its street type translated and placed', () => {
    i18nStore.set('uz');
    expect(localizePlace('Шота Руставели улица, Яккасарайский район')).toBe('Shota Rustaveli koʻchasi, Yakkasaray tumani');
    i18nStore.set('en');
    expect(localizePlace('Шота Руставели улица, Яккасарайский район')).toBe('Shota Rustaveli Street, Yakkasaray District');
  });

  it('a building number stays after the street type', () => {
    i18nStore.set('uz');
    expect(shortAddress({ road: 'Восита Вахидова улица', house_number: '12', district: 'Мирабадский район' }))
      .toBe('Vosita Vaxidova koʻchasi 12, Mirabad tumani');
    i18nStore.set('en');
    expect(shortAddress({ road: 'Восита Вахидова улица', house_number: '12', district: 'Мирабадский район' }))
      .toBe('Vosita Vakhidova Street 12, Mirabad District');
  });

  it('a district adjective loses its ending, not "-skiy"', () => {
    i18nStore.set('uz');
    expect(localizePlace('Amir Temur, Чиназский район')).toBe('Amir Temur, Chinaz tumani');
    i18nStore.set('en');
    expect(localizePlace('Amir Temur, Чиназский район')).toBe('Amir Temur, Chinaz District');
  });

  it('TsUM is never "SUM" (an abbreviation keeps ц as ts)', () => {
    for (const lang of ['uz', 'en'] as const) {
      i18nStore.set(lang);
      const out = localizePlace('Сергели ЦУМ, Сергелийский район');
      expect(out).toMatch(/^Sergeli TsUM, Sergeli /);
      expect(out).not.toMatch(/\bSUM\b/);
    }
    i18nStore.set('uz');
    expect(localizePlace('Буюк Ипак Йули (Ц-1)')).toBe('Buyuk Ipak Yuli (Ts-1)');
  });

  it('Russian stays as it is', () => {
    i18nStore.set('ru');
    expect(localizePlace('Сергели ЦУМ, Юнусабадский район')).toBe('Сергели ЦУМ, Юнусабадский район');
  });
});

describe('labelArea', () => {
  it('is the area of any short label', () => {
    expect(labelArea('Восита Вахидова улица 12, Мирабадский район')).toBe('Мирабадский район');
    expect(labelArea('Amir Temur, Мирзо-Улугбекский район')).toBe('Мирзо-Улугбекский район');
    expect(labelArea('Чиланзар-10, 13/1')).toBe('Чиланзар-10');
    expect(labelArea('Чиланзар')).toBe('Чиланзар');
  });

  it('does not mistake a numbered name for a building number', () => {
    expect(labelArea('Yunusobod, 5-мавзе')).toBe('5-мавзе');
  });
});

beforeEach(() => i18nStore.set('ru'));
