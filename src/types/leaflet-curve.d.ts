import * as L from 'leaflet';

declare module 'leaflet' {
  function curve(
    path: any,
    options?: L.PathOptions
  ): L.Path;
}