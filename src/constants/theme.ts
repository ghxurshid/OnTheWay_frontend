/* ════════════════════════════════════════════════════════════════
   THEME TOKENS  (dark / light)
   ────────────────────────────────────────────────────────────────
   Accent colours are identical across themes; only surface / bg / text
   tokens swap. `T` is a single, in-place-mutated token object that every
   component reads (`T.teal`, `T.surface`, …). `themeStore` mutates `T`,
   persists the choice and notifies subscribers.
   ════════════════════════════════════════════════════════════════ */

export type ThemeMode = 'dark' | 'light';

export const ACCENTS = {
  teal: '#1fc8c0', tealGlow: 'rgba(31,200,192,0.3)',
  amber: '#f0a832', red: '#ff5c72', green: '#2ecc8e', purple: '#a78bfa',
};

/** The full set of design tokens a theme provides. */
export interface Theme {
  teal: string; tealGlow: string; amber: string; red: string; green: string; purple: string;
  bg: string; surface: string; surface2: string; border: string; text: string; muted: string;
  tealDim: string; amberDim: string; glass: string; glassSolid: string; glass2: string; glassMid: string;
  hover: string; track: string; scrimRgb: string; stage: string; leafletBg: string; markerStroke: string;
  isDark: boolean;
}

export const THEMES: Record<ThemeMode, Theme> = {
  dark: {
    ...ACCENTS,
    bg: '#0f1117', surface: '#171b24', surface2: '#1e2330',
    border: 'rgba(255,255,255,0.07)', text: '#f0f2f7', muted: '#8892a4',
    tealDim: 'rgba(31,200,192,0.15)', amberDim: 'rgba(240,168,50,0.15)',
    glass: 'rgba(23,27,36,0.92)', glassSolid: 'rgba(15,17,23,0.98)',
    glass2: 'rgba(20,24,32,0.95)', glassMid: 'rgba(40,46,58,0.98)',
    hover: 'rgba(255,255,255,0.05)', track: 'rgba(255,255,255,0.1)',
    scrimRgb: '10,12,16', stage: '#0a0c10', leafletBg: '#0d1018',
    markerStroke: '#0f1117', isDark: true,
  },
  light: {
    ...ACCENTS,
    bg: '#eef1f6', surface: '#ffffff', surface2: '#f3f5f9',
    border: 'rgba(18,22,30,0.10)', text: '#161b24', muted: '#677085',
    tealDim: 'rgba(31,200,192,0.16)', amberDim: 'rgba(240,168,50,0.18)',
    glass: 'rgba(255,255,255,0.94)', glassSolid: 'rgba(255,255,255,0.985)',
    glass2: 'rgba(246,248,252,0.96)', glassMid: 'rgba(224,229,238,0.98)',
    hover: 'rgba(18,22,30,0.05)', track: 'rgba(18,22,30,0.14)',
    scrimRgb: '228,232,240', stage: '#d7dde6', leafletBg: '#e6eaf0',
    markerStroke: '#ffffff', isDark: false,
  },
};

// T — the single object mutated in place; all components read `T.xxx`.
export const T: Theme = { ...THEMES.dark };

export const themeStore = {
  mode: ((typeof localStorage !== 'undefined' && localStorage.getItem('otw-theme')) || 'dark') as ThemeMode,
  listeners: new Set<(mode: ThemeMode) => void>(),
  apply() {
    Object.assign(T, THEMES[this.mode] || THEMES.dark);
    if (typeof document !== 'undefined') {
      document.documentElement.style.background = T.stage;
      if (document.body) document.body.style.background = T.stage;
      document.documentElement.setAttribute('data-theme', this.mode);
    }
  },
  set(mode: ThemeMode) {
    this.mode = mode;
    try { localStorage.setItem('otw-theme', mode); } catch { /* ignore */ }
    this.apply();
    this.listeners.forEach((l) => l(mode));
  },
  toggle() { this.set(this.mode === 'dark' ? 'light' : 'dark'); },
  subscribe(fn: (mode: ThemeMode) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
};

themeStore.apply();
