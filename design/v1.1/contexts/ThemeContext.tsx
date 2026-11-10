/* ════════════════════════════════════════════════════════════════
   ThemeProvider — the single React re-render seam for the theme store.
   Components read tokens directly from the `T` singleton (zero prop
   drilling); this provider subscribes once at the root and re-renders the
   whole tree when the mode changes, then exposes mode/toggle via context.
   ════════════════════════════════════════════════════════════════ */

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { T, themeStore } from '@/constants/theme';
import type { Theme, ThemeMode } from '@/constants/theme';

interface ThemeContextValue {
  T: Theme;
  mode: ThemeMode;
  isDark: boolean;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(themeStore.mode);
  useEffect(() => themeStore.subscribe(setMode), []);
  const value: ThemeContextValue = {
    T,
    mode,
    isDark: mode === 'dark',
    setMode: (m: ThemeMode) => themeStore.set(m),
    toggle: () => themeStore.toggle(),
  };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeContext must be used within <ThemeProvider>');
  return ctx;
}
