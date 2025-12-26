import * as L from 'leaflet';

declare module 'leaflet' {
  interface MarkerClusterGroup extends L.LayerGroup {}
  function markerClusterGroup(options?: any): MarkerClusterGroup;
}
