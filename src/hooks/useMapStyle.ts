/* useMapStyle — the basemap the user picked ('theme' follows the app's
   light/dark theme; 'streets' / 'satellite' are fixed) and the concrete tile
   style id it resolves to. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { themeStore } from '@/constants/theme';
import { tileStyleFor } from '@/constants/map';

export function useMapStyle() {
  const [mapStyleMode, setMapStyleMode] = useState('theme');
  const [mapStyle, setMapStyle] = useState(() => tileStyleFor('theme', themeStore.mode));
  const modeRef = useRef('theme');

  const changeMapStyleMode = useCallback((mode: string) => {
    modeRef.current = mode;
    setMapStyleMode(mode);
    setMapStyle(tileStyleFor(mode, themeStore.mode));
  }, []);

  // Only the 'theme' mode actually resolves differently after a theme switch.
  useEffect(() => themeStore.subscribe((theme) => setMapStyle(tileStyleFor(modeRef.current, theme))), []);

  return { mapStyle, mapStyleMode, changeMapStyleMode };
}
