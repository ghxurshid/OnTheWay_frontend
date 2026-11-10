import { describe, it, expect, vi, beforeEach } from 'vitest';
import { i18nStore } from '@/i18n';
import { geocode, placeLabel, reverseGeocode, suggestionToPlace } from './geocodingService';

const api = vi.hoisted(() => ({ search: vi.fn(), reverse: vi.fn() }));
vi.mock('@/api/geoApi', () => ({ geoApi: api }));

// Real answer to "Amir Temur Tashkent" (the name sits under `railway`, which is not read).
const STATION = {
  lat: '41.3', lon: '69.28',
  display_name: 'Amir Temur, Мустакиллик проспект, Буюк Ипак Йули (Ц-1), Мирзо-Улугбекский район, Ташкент, 100000, Узбекистан',
  address: { railway: 'Amir Temur', road: 'Мустакиллик проспект', neighbourhood: 'Буюк Ипак Йули (Ц-1)', district: 'Мирзо-Улугбекский район', city: 'Ташкент' },
};

beforeEach(() => {
  i18nStore.set('uz');
  api.search.mockReset();
  api.reverse.mockReset();
});

describe('a picked suggestion', () => {
  it('keeps the name the user tapped, not the road it stands on', async () => {
    api.search.mockResolvedValue([STATION]);
    const [hit] = await geocode('Amir Temur Tashkent');
    expect(placeLabel(hit.display_name, 3)).toMatch(/^Amir Temur, /); // what the list showed
    const { label, latlng } = suggestionToPlace(hit);
    expect(label).toMatch(/^Amir Temur, .* tumani$/);
    expect(latlng).toEqual([41.3, 69.28]);
  });

  it('a street stays "Street, District", also once the list localized its display name', async () => {
    api.search.mockResolvedValue([{
      lat: '41.3', lon: '69.28',
      display_name: 'Мустакиллик проспект, Мирзо-Улугбекский район, Ташкент',
      address: { road: 'Мустакиллик проспект', district: 'Мирзо-Улугбекский район', city: 'Ташкент' },
    }]);
    const [hit] = await geocode('Mustaqillik');
    expect(suggestionToPlace(hit).label).toMatch(/^Mustakillik shoh koʻchasi, .* tumani$/); // transliterated from the Russian name
  });

  it('without address details uses the display name', () => {
    expect(suggestionToPlace({ lat: '1', lon: '2', display_name: 'Amir Temur, Toshkent, Oʻzbekiston' }).label).toBe('Amir Temur, Toshkent');
  });
});

describe('a map pick (reverse geocode)', () => {
  it('goes through the same label as a suggestion', async () => {
    api.reverse.mockResolvedValue(STATION);
    await expect(reverseGeocode([41.3, 69.28])).resolves.toMatch(/^Amir Temur, .* tumani$/);
  });

  it('a building with no road keeps its number', async () => {
    api.reverse.mockResolvedValue({
      display_name: '13/1, Чиланзар-10, Чиланзар, Чиланзарский район, Ташкент, 100000, Узбекистан',
      address: { house_number: '13/1', residential: 'Чиланзар-10', suburb: 'Чиланзар', district: 'Чиланзарский район', city: 'Ташкент' },
    });
    await expect(reverseGeocode([41.28, 69.2])).resolves.toBe('Chilanzar-10, 13/1');
  });

  it('with no answer shows the coordinates, never blocks', async () => {
    api.reverse.mockRejectedValue(new Error('down'));
    await expect(reverseGeocode([41.3, 69.24])).resolves.toBe('41.3000, 69.2400');
  });
});
