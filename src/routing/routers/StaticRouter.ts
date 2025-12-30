import L from 'leaflet';
import  { routeData } from '../../data/routes.mock.ts';
import { Route } from '../types.ts';

export class CustomRouter implements L.Routing.IRouter {

  route(
    waypoints: L.Routing.Waypoint[],
    callback: (error?: L.Routing.IError, routes?: L.Routing.IRoute[]) => any,
    context?: any
  ): void {    
    // ⚠️ LRM router async bo‘lishini kutadi
    setTimeout(() => {

      if (waypoints.length < 2) {
        callback.call(context, {status: -1, message: "Kamida 2 waypoint kerak"});
        return;
      }

      if (waypoints[0].latLng.equals(waypoints[1].latLng)) {
        callback.call(context, {status: -1, message: "Origin va destination bir xil bo'lishi mumkin emas"});
        return;
      }

      let foundRoute: Route | null = null;
       
      for (const element of routeData) {
        const wp1 = element.waypoints[0];
        const wp2 = element.waypoints[1];

        if (
          wp1.lat === waypoints[0].latLng.lat &&
          wp1.lng === waypoints[0].latLng.lng &&
          wp2.lat === waypoints[1].latLng.lat &&
          wp2.lng === waypoints[1].latLng.lng
        ) {
          foundRoute = {
            name: 'Simulated Route' + wp1.lat + ',' + wp1.lng + ' to ' + wp2.lat + ',' + wp2.lng,
            coordinates: element.route.coordinates.map((coord: any) =>
              L.latLng(coord.lat, coord.lng)
            ),
            summary: {
              totalDistance: element.route.distance,
              totalTime: element.route.time
            },
            waypoints: [
              L.latLng(wp1.lat, wp1.lng),
              L.latLng(wp2.lat, wp2.lng)
            ],
            instructions: [ ],
            inputWaypoints: waypoints
          };
          break;
        }
      }

      if (!foundRoute) {
        callback.call(context, {status: -1, message: "Route topilmadi"});
        return;
      }
       
      // ✅ LRM KUTADIGAN FORMAT
      callback.call(context, undefined, [foundRoute]);

    }, 0);
  }
}