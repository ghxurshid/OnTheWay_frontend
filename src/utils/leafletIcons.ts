/* ════════════════════════════════════════════════════════════════
   LEAFLET ICON FACTORIES + ant-path helper
   All SVG/divIcon builders that the map layer uses. Imports Leaflet as a
   module (npm) and pulls in leaflet-ant-path for its side-effect of
   registering L.polyline.antPath. Leaflet is untyped, so its return values
   flow as `any`; the factory params carry real (string/theme) types.
   ════════════════════════════════════════════════════════════════ */

import L from 'leaflet';
import 'leaflet-ant-path';
import { T } from '@/constants/theme';
import type { StyleTheme } from '@/constants/map';
import { t } from '@/i18n';
import type { LatLng } from '@/utils/geo';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LeafletIcon = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AntPathOptions = Record<string, any>;

export function makeMarkerIcon(color: string, label: string): LeafletIcon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
    <path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 24 16 24s16-14 16-24C32 7.163 24.837 0 16 0z"
      fill="${color}" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>
    <circle cx="16" cy="16" r="7" fill="white" fill-opacity="0.9"/>
    <text x="16" y="20" text-anchor="middle" font-size="9" font-weight="700"
      font-family="DM Sans,sans-serif" fill="${color}">${label}</text>
  </svg>`;
  return L.divIcon({ html: svg, className: '', iconSize: [32, 40], iconAnchor: [16, 40], popupAnchor: [0, -40] });
}

export function makeUserDot(): LeafletIcon {
  return L.divIcon({ html: '<div class="user-dot"></div>', className: '', iconSize: [16, 16], iconAnchor: [8, 8] });
}

export function makeMatchedIcon(color: string, initials: string): LeafletIcon {
  return L.divIcon({
    html: `<div class="matched-marker" style="background:${color}22;border-color:${color};color:${color}">${initials}</div>`,
    className: '', iconSize: [40, 40], iconAnchor: [20, 20],
  });
}

// Ant-path (crawling dashes) — falls back to a plain dashed polyline when
// the plugin isn't available.
export function makeAntPath(latlngs: LatLng[], opts: AntPathOptions): LeafletIcon {
  if (L.polyline && typeof L.polyline.antPath === 'function') {
    return L.polyline.antPath(latlngs, opts);
  }
  if (L.Polyline && L.Polyline.AntPath) {
    return new L.Polyline.AntPath(latlngs, opts);
  }
  return L.polyline(latlngs, { color: opts.color, weight: opts.weight, opacity: opts.opacity, dashArray: '10 14' });
}

export function makeWalkerIcon(color: string, initials: string): LeafletIcon {
  return L.divIcon({
    html: `<div style="position:relative;width:34px;height:34px">
      <div style="position:absolute;inset:-16px;border-radius:50%;cursor:pointer"></div>
      <div style="position:absolute;inset:-6px;border-radius:50%;background:${color}33;animation:pulse 1.8s ease infinite;pointer-events:none"></div>
      <div style="width:34px;height:34px;border-radius:50%;background:${color};border:2.5px solid #fff;
        box-shadow:0 2px 8px rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;
        font:700 12px 'DM Sans',sans-serif;color:#fff;position:relative;z-index:1;pointer-events:none">${initials}</div>
    </div>`,
    className: '', iconSize: [34, 34], iconAnchor: [17, 17],
  });
}

export function makeStartIcon(color: string, theme: StyleTheme): LeafletIcon {
  return L.divIcon({
    html: `<div style="width:13px;height:13px;border-radius:50%;background:${color};
      border:3px solid ${theme.markerStroke};box-shadow:0 0 0 2px ${color}"></div>`,
    className: '', iconSize: [13, 13], iconAnchor: [6.5, 6.5],
  });
}

export function makeDestIcon(color: string, theme: StyleTheme): LeafletIcon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="32" viewBox="0 0 26 32">
    <path d="M13 0C5.82 0 0 5.82 0 13c0 8.5 13 19 13 19s13-10.5 13-19C26 5.82 20.18 0 13 0z"
      fill="${color}" stroke="${theme.markerStroke}" stroke-width="1.5"/>
    <circle cx="13" cy="13" r="4.6" fill="#fff" fill-opacity="0.95"/>
  </svg>`;
  return L.divIcon({ html: svg, className: '', iconSize: [26, 32], iconAnchor: [13, 32] });
}

// Current user ("you") — distinct rippling marker with a heading arrow.
export function makeMeIcon(): LeafletIcon {
  return L.divIcon({
    html: `<div style="position:relative;width:44px;height:44px">
      <div style="position:absolute;left:50%;top:50%;width:30px;height:30px;margin:-15px 0 0 -15px;
        transform-origin:center;border-radius:50%;border:2px solid ${T.teal};
        animation:ripple 2.2s ease-out infinite"></div>
      <div style="position:absolute;left:50%;top:50%;width:30px;height:30px;margin:-15px 0 0 -15px;
        transform-origin:center;border-radius:50%;border:2px solid ${T.teal};
        animation:ripple 2.2s ease-out infinite 1.1s"></div>
      <div style="position:absolute;left:50%;top:50%;width:30px;height:30px;transform:translate(-50%,-50%);
        border-radius:50%;background:linear-gradient(135deg,#2fe6dd,#0e9e97);
        border:3.5px solid #fff;
        box-shadow:0 0 0 2px ${T.teal},0 0 22px ${T.teal},0 4px 14px rgba(0,0,0,.65);
        display:flex;align-items:center;justify-content:center">
        <div class="me-arrow" style="display:flex;align-items:center;justify-content:center;transform-origin:center;transition:transform .35s ease">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M12 2 L20 21 L12 16 L4 21 Z" fill="#fff"/>
          </svg>
        </div>
      </div>
      <div style="position:absolute;left:50%;top:-22px;transform:translateX(-50%);
        background:linear-gradient(135deg,#2fe6dd,#0e9e97);color:#04201e;
        font:800 9.5px 'DM Sans',sans-serif;letter-spacing:.6px;
        padding:3px 9px;border-radius:10px;white-space:nowrap;
        border:1.5px solid rgba(255,255,255,.85);
        box-shadow:0 3px 10px rgba(0,0,0,.5),0 0 14px ${T.teal}aa">${t('mapui.you')}</div>
    </div>`,
    className: '', iconSize: [44, 44], iconAnchor: [22, 22],
  });
}
