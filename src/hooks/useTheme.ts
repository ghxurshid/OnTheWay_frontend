import { useState, useEffect } from 'react';
import { T, themeStore } from '@/constants/theme';
import type { ThemeMode } from '@/constants/theme';

/**
 * Subscribe to the theme store and re-render on change.
 * Returns the live token object `T`, the mode, and setters.
 */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(themeStore.mode);
  useEffect(() => themeStore.subscribe(setMode), []);
  return {
    T,
    mode,
    isDark: mode === 'dark',
    setMode: (m: ThemeMode) => themeStore.set(m),
    toggle: () => themeStore.toggle(),
  };
}
