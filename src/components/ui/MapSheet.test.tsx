import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MapSheet } from './MapSheet';

afterEach(cleanup);

/** MapUI is `pointer-events:none`, so gestures reach the map through its empty areas.
    Whatever it hosts has to turn them back on, or taps fall through to what lies below. */
const inMapChrome = () => render(
  <div style={{ pointerEvents: 'none' }}>
    <span data-testid="plain">plain</span>
    <MapSheet title="Sheet" onClose={() => {}}><button>inside</button></MapSheet>
  </div>,
);

describe('MapSheet inside the map chrome', () => {
  it('the environment inherits pointer-events, so the next test means something', () => {
    inMapChrome();
    expect(getComputedStyle(screen.getByTestId('plain')).pointerEvents).toBe('none');
  });

  // E2E 2026-11-06: the visibility and list sheets ignored real taps (they fell through to the map).
  it('its controls take taps', () => {
    inMapChrome();
    expect(getComputedStyle(screen.getByRole('button', { name: 'inside' })).pointerEvents).not.toBe('none');
  });
});
