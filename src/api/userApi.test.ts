import { describe, it, expect } from 'vitest';
import { toVehicleBody } from './userApi';

describe('PUT /users/me/vehicle body', () => {
  it('sends the structured car (trimmed, plate upper-cased, empty optional fields as null)', () => {
    expect(toVehicleBody({ model: ' Chevrolet Cobalt ', color: '', plate: '01 a 777 bb', seats: 3 }))
      .toEqual({ model: 'Chevrolet Cobalt', color: null, plate: '01 A 777 BB', seats: 3 });
  });

  it('clears every field with null (back to passenger)', () => {
    const cleared = { vehicle: null, model: null, color: null, plate: null, seats: null };
    expect(toVehicleBody(null)).toEqual(cleared);
    expect(toVehicleBody({ model: '  ' })).toEqual(cleared);
  });
});
