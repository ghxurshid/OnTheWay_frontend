/* ════════════════════════════════════════════════════════════════
   MAP CONSTANTS — tile styles, default centre, per-style contrast theme
   ════════════════════════════════════════════════════════════════ */

import type { CSSProperties } from 'react';
import type { LatLng } from '@/utils/geo';

export const TASHKENT: LatLng = [41.2995, 69.2401];

export interface MapStyle {
  id: string;
  url: string;
  subdomains: string;
}

export const MAP_STYLES: MapStyle[] = [
  { id: 'dark', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', subdomains: 'abcd' },
  { id: 'streets', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', subdomains: 'abc' },
  { id: 'light', url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', subdomains: 'abcd' },
  { id: 'satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', subdomains: '' },
];

/** Basemap modes offered by the picker; 'theme' follows the app's light/dark theme. */
export const MAP_STYLE_MODES = ['theme', 'streets', 'satellite'] as const;

/** Resolve a basemap mode to a concrete tile style id. */
export const tileStyleFor = (mode: string, appTheme: string): string =>
  mode === 'theme' ? (appTheme === 'light' ? 'light' : 'dark') : mode;

export interface StyleTheme {
  traveled: string;
  pulse: string;
  markerStroke: string;
}

// Per-map-style contrast tokens used by the walker / route renderer so
// traveled lines and pulses stay legible on every basemap.
export const STYLE_THEME: Record<string, StyleTheme> = {
  dark:      { traveled: 'rgba(255,255,255,0.22)', pulse: '#ffffff',             markerStroke: '#0f1117' },
  streets:   { traveled: 'rgba(20,24,32,0.45)',    pulse: '#ffffff',             markerStroke: '#ffffff' },
  light:     { traveled: 'rgba(20,24,32,0.42)',    pulse: 'rgba(18,22,30,0.85)', markerStroke: '#ffffff' },
  satellite: { traveled: 'rgba(255,255,255,0.55)', pulse: '#0a0c10',             markerStroke: '#ffffff' },
};

export const themeFor = (id: string): StyleTheme => STYLE_THEME[id] || STYLE_THEME.dark;

// Map-style picker preview swatch backgrounds (pure presentation).
export function mapStylePreviewBg(id: string): CSSProperties {
  if (id === 'streets') return {
    background: '#dadbc1',
    backgroundImage: 'linear-gradient(45deg,#a8c5a8 25%,transparent 25%,transparent 75%,#a8c5a8 75%),linear-gradient(45deg,#a8c5a8 25%,#dadbc1 25%,#dadbc1 75%,#a8c5a8 75%)',
    backgroundSize: '8px 8px', backgroundPosition: '0 0,4px 4px',
  };
  if (id === 'satellite') return { background: 'radial-gradient(circle at 30% 35%,#3d6b4d,transparent 60%),radial-gradient(circle at 70% 65%,#2a4d3d,transparent 55%),linear-gradient(135deg,#1a3a4d,#2d4a3a)' };
  if (id === 'light') return { background: 'linear-gradient(135deg,#f6f4ef,#dde2e5)' };
  return { background: 'linear-gradient(135deg,#0d1018,#1a2030)' };
}
