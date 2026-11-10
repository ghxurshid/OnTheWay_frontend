/** Rough saving of a shared ride: half of a typical Tashkent taxi fare
    (~2 000 so'm/km), rounded — shown as an estimate, never as a price. */
export const estimateSaving = (km: number): number => Math.max(0, Math.round((km * 1000) / 500) * 500);
