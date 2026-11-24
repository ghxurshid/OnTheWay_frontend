import { describe, it, expect, vi } from 'vitest';
import { toRoutePublishDto } from './routeService';
import type { LatLng } from '@/utils/geo';

vi.mock('@/api/geoApi', () => ({ geoApi: { route: vi.fn() } }));

const COORDS: LatLng[] = [[41.28, 69.2], [41.3, 69.25], [41.33, 69.28]];
const ROUTE = { distance: 8400, duration: 1260 };

describe('toRoutePublishDto', () => {
  it('shares the picked places as the route ends\' labels', () => {
    expect(toRoutePublishDto(COORDS, ROUTE, { from: "Kichik Halqa yo'li, Chilonzor Tumani", to: 'Amir Temur, Yunusobod Tumani' })).toEqual({
      origin: { lat: 41.28, lng: 69.2 },
      originLabel: "Kichik Halqa yo'li, Chilonzor Tumani",
      destination: { lat: 41.33, lng: 69.28 },
      destinationLabel: 'Amir Temur, Yunusobod Tumani',
      points: [{ lat: 41.28, lng: 69.2 }, { lat: 41.3, lng: 69.25 }, { lat: 41.33, lng: 69.28 }],
      distanceKm: 8.4,
      etaMinutes: 21,
    });
  });

  it('a blank or missing label is sent as null (the watcher geocodes the point)', () => {
    const dto = toRoutePublishDto(COORDS, ROUTE, { from: '   ', to: undefined });
    expect(dto.originLabel).toBeNull();
    expect(dto.destinationLabel).toBeNull();
    expect(toRoutePublishDto(COORDS, ROUTE)).toMatchObject({ originLabel: null, destinationLabel: null });
  });

  it('trims a label', () => {
    expect(toRoutePublishDto(COORDS, ROUTE, { from: ' Chorsu ', to: 'Yunusobod ' })).toMatchObject({ originLabel: 'Chorsu', destinationLabel: 'Yunusobod' });
  });

  it('without OSRM figures sends no distance or ETA', () => {
    expect(toRoutePublishDto(COORDS, null)).toMatchObject({ distanceKm: null, etaMinutes: null });
  });
});
