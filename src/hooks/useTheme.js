import { useState, useEffect } from 'react';
import { T, themeStore } from '@/constants/theme';

/**
 * Subscribe to the theme store and re-render on change.
 * Returns the live token object `T`, the mode, and setters.
 */
export function useTheme() {
  const [mode, setMode] = useState(themeStore.mode);
  useEffect(() => themeStore.subscribe(setMode), []);
  return {
    T,
    mode,
    isDark: mode === 'dark',
    setMode: (m) => themeStore.set(m),
    toggle: () => themeStore.toggle(),
  };
}
