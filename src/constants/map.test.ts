import { describe, it, expect } from 'vitest';
import { tileStyleFor } from './map';

describe('tileStyleFor', () => {
  it('follows the app theme in "theme" mode', () => {
    expect(tileStyleFor('theme', 'light')).toBe('light');
    expect(tileStyleFor('theme', 'dark')).toBe('dark');
  });

  it('keeps an explicit basemap regardless of the app theme', () => {
    expect(tileStyleFor('satellite', 'light')).toBe('satellite');
    expect(tileStyleFor('streets', 'dark')).toBe('streets');
  });
});
