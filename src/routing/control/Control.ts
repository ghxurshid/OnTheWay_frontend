import L from 'leaflet';
import { antPath } from 'leaflet-ant-path';
import 'leaflet-routing-machine';

export interface AnimatedRoutingControlOptions extends L.Routing.RoutingControlOptions {
  color?: string; // Line rangi
}

export class AnimatedRoutingControl extends L.Routing.Control {
  constructor(options: AnimatedRoutingControlOptions) {
    super(options);
  }

  // Har bir route chizilganda antPath ishlaydi
  routeLine(route: L.Routing.IRoute, options?: L.Routing.RoutingOptions) {
    const color = (options as AnimatedRoutingControlOptions)?.color || '#1E88E5';
    console.log("fucking color", color);
    return antPath(route.coordinates, {
      color,
      pulseColor: '#FFFFFF',
      weight: 5,
      delay: 400,
      dashArray: [10, 20],
      opacity: 0.9,
      pane: 'overlayPane', // mapda tepada
    });
  }
}
