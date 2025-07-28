// src/types/leaflet-routing-machine.d.ts
import * as L from 'leaflet';

declare module 'leaflet' {
  namespace Routing {
    class Control extends L.Control {
      constructor(options?: RoutingControlOptions);
      getPlan(): any;
      setWaypoints(waypoints: L.LatLng[]): void;
    }

    interface RoutingControlOptions extends L.ControlOptions {
      waypoints?: L.LatLng[];
      router?: any;
      plan?: any;
      createMarker?: (
        i: number,
        waypoint: L.LatLng,
        n: number
      ) => L.Marker | undefined;
      routeWhileDragging?: boolean;
    }
  }
}
