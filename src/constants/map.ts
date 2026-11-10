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
  /** CSS class on the tile pane (filters that restyle the base tiles). */
  className?: string;
  /** MapLibre style URL. When set (and WebGL works) the basemap is drawn as
   *  vectors so street names stay readable at any map rotation; `url` is the
   *  raster fallback. */
  vector?: string;
}

// OpenFreeMap: keyless, no rate limit, OpenMapTiles styles whose line labels
// use text-keep-upright (flip past 90° so they never read upside down).
const OFM = 'https://tiles.openfreemap.org/styles/';

// The theme basemaps (dark / light) are OpenStreetMap tiles restyled with a
// CSS filter (styles/global.css). CARTO's keyless basemaps answer some hosts
// (Telegram WebViews, sandboxed previews) with an "API KEY REQUIRED" tile that
// covers the whole map, so the app does not depend on them.
// openstreetmap.org also 403s embedded/sandboxed origins, so use Esri's keyless street tiles.
const OSM = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';

export const MAP_STYLES: MapStyle[] = [
  { id: 'dark', url: OSM, subdomains: '', className: 'otw-tiles-dark', vector: OFM + 'dark' },
  { id: 'streets', url: OSM, subdomains: '', vector: OFM + 'liberty' },
  { id: 'light', url: OSM, subdomains: '', className: 'otw-tiles-light', vector: OFM + 'positron' },
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
