import L from 'leaflet';

export interface Route extends L.Routing.IRoute {
    inputWaypoints: L.Routing.Waypoint[];
  }