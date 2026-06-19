/* ════════════════════════════════════════════════════════════════
   MAP CONSTANTS — tile styles, default centre, per-style contrast theme
   ════════════════════════════════════════════════════════════════ */

import { t } from '@/i18n';

export const TASHKENT = [41.2995, 69.2401];

export const MAP_STYLES = [
  { id: 'dark', label: 'Tungi', sub: 'Default',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', subdomains: 'abcd' },
  { id: 'streets', label: "Ko'cha", sub: 'Streets',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', subdomains: 'abc' },
  { id: 'light', label: "Yorug'", sub: 'Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', subdomains: 'abcd' },
  { id: 'satellite', label: "Sun'iy", sub: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', subdomains: '' },
];

// Per-map-style contrast tokens used by the walker / route renderer so
// traveled lines and pulses stay legible on every basemap.
export const STYLE_THEME = {
  dark:      { traveled: 'rgba(255,255,255,0.22)', pulse: '#ffffff',             markerStroke: '#0f1117' },
  streets:   { traveled: 'rgba(20,24,32,0.45)',    pulse: '#ffffff',             markerStroke: '#ffffff' },
  light:     { traveled: 'rgba(20,24,32,0.42)',    pulse: 'rgba(18,22,30,0.85)', markerStroke: '#ffffff' },
  satellite: { traveled: 'rgba(255,255,255,0.55)', pulse: '#0a0c10',             markerStroke: '#ffffff' },
};

export const themeFor = (id) => STYLE_THEME[id] || STYLE_THEME.dark;

// Map-style picker preview swatch backgrounds (pure presentation).
export function mapStylePreviewBg(id) {
  if (id === 'streets') return {
    background: '#dadbc1',
    backgroundImage: 'linear-gradient(45deg,#a8c5a8 25%,transparent 25%,transparent 75%,#a8c5a8 75%),linear-gradient(45deg,#a8c5a8 25%,#dadbc1 25%,#dadbc1 75%,#a8c5a8 75%)',
    backgroundSize: '8px 8px', backgroundPosition: '0 0,4px 4px',
  };
  if (id === 'satellite') return { background: 'radial-gradient(circle at 30% 35%,#3d6b4d,transparent 60%),radial-gradient(circle at 70% 65%,#2a4d3d,transparent 55%),linear-gradient(135deg,#1a3a4d,#2d4a3a)' };
  if (id === 'light') return { background: 'linear-gradient(135deg,#f6f4ef,#dde2e5)' };
  return { background: 'linear-gradient(135deg,#0d1018,#1a2030)' };
}

// Map-style metadata that needs i18n labels (call at render time).
export const mapStyleLabel = (id) => t('mapStyles.' + id);
