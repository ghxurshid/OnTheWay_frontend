import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { i18nStore } from '@/i18n';
import { UserPopup } from './UserPopup';
import type { MapPerson } from './types';

const geo = vi.hoisted(() => ({ reverseGeocode: vi.fn() }));
vi.mock('@/services/geocodingService', () => geo);

const person = (over: Partial<MapPerson>): MapPerson => ({
  id: '7', type: 'driver', initials: 'AK', name: 'Aziz Karimov',
  startLatlng: [41.28, 69.2], destLatlng: [41.33, 69.28], ...over,
});

const mount = (user: MapPerson) => render(
  <UserPopup user={user} onClose={vi.fn()} onCall={vi.fn()} onChat={vi.fn()} onRide={vi.fn()} onReport={vi.fn()} onBlock={vi.fn()} />,
);

beforeEach(() => { i18nStore.set('uz'); geo.reverseGeocode.mockReset(); });
afterEach(cleanup);

describe('UserPopup: where they are heading', () => {
  it('shows the labels the person shared, without geocoding the ends', async () => {
    mount(person({ startLabel: "Kichik Halqa yo'li, Chilonzor Tumani", destLabel: 'Amir Temur, Yunusobod Tumani' }));
    expect(await screen.findByText("Kichik Halqa yo'li, Chilonzor Tumani → Amir Temur, Yunusobod Tumani")).toBeInTheDocument();
    expect(geo.reverseGeocode).not.toHaveBeenCalled();
  });

  it('a label shared from a Russian UI reads in this UI\'s script', async () => {
    mount(person({ id: '8', startLabel: 'Катартал улица, Чиланзарский район', destLabel: "Qatortol ko'chasi" }));
    expect(await screen.findByText("Katartal koʻchasi, Chilanzar tumani → Qatortol ko'chasi")).toBeInTheDocument();
  });

  it('falls back to the area around an end that has no label', async () => {
    geo.reverseGeocode.mockResolvedValue('Bunyodkor shoh koʻchasi, Chilonzor Tumani');
    mount(person({ id: '9', startLatlng: [41.2701, 69.2101], startLabel: null, destLabel: 'Chorsu' }));
    expect(await screen.findByText('Chilonzor Tumani → Chorsu')).toBeInTheDocument();
    expect(geo.reverseGeocode).toHaveBeenCalledTimes(1);
  });
});
