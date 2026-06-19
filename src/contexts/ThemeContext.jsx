/* ════════════════════════════════════════════════════════════════
   ThemeProvider — the single React re-render seam for the theme store.
   Components read tokens directly from the `T` singleton (zero prop
   drilling); this provider subscribes once at the root and re-renders the
   whole tree when the mode changes, then exposes mode/toggle via context.
   ════════════════════════════════════════════════════════════════ */

import { createContext, useContext, useEffect, useState } from 'react';
import { T, themeStore } from '@/constants/theme';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(themeStore.mode);
  useEffect(() => themeStore.subscribe(setMode), []);
  const value = {
    T,
    mode,
    isDark: mode === 'dark',
    setMode: (m) => themeStore.set(m),
    toggle: () => themeStore.toggle(),
  };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeContext must be used within <ThemeProvider>');
  return ctx;
}
