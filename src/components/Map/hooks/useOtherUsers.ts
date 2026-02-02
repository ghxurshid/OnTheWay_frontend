import { useEffect, useRef } from "react";
import L from "leaflet";
import { routeData } from "../../../data/routes.mock";
import { createRotatingTaxiMarker } from "../leaflet/markers";
import { createCustomMarker } from "../leaflet/markers";
import { createMarkerCluster } from "../leaflet/clusters";
import { OSM_ROUTE_COLORS } from "../../../data/colors";
import { CustomRouter } from "../../../routing/routers/StaticRouter";
import { antPath } from 'leaflet-ant-path';


export function useOtherUsers(mapRef: React.RefObject<L.Map | null>) {
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);

  useEffect(() => {
    const map = mapRef?.current;
    if (!map || clusterRef.current) return;

    clusterRef.current = createMarkerCluster(map);

    routeData.forEach(r => {
      const color =
        OSM_ROUTE_COLORS[Math.floor(Math.random() * OSM_ROUTE_COLORS.length)];

      const marker = createRotatingTaxiMarker(
        [r.waypoints[0].lat, r.waypoints[0].lng],
        Math.random() * 360        
      );

      //clusterRef.current!.addLayer(marker);
      marker.addTo(map)

      const routing = L.Routing.control({
        waypoints: [
          L.latLng(r.waypoints[0].lat, r.waypoints[0].lng),
          L.latLng(r.waypoints[1].lat, r.waypoints[1].lng),
        ],
        addWaypoints: false,
        show: false,
        fitSelectedRoutes: true,
        routeWhileDragging: false,
        showAlternatives: false,
        router: new CustomRouter(),
        plan: L.Routing.plan([
          L.latLng(r.waypoints[0].lat, r.waypoints[0].lng),
          L.latLng(r.waypoints[1].lat, r.waypoints[1].lng),        
        ], {
          createMarker: createCustomMarker, // markerlarni yashirish 
        }),
        lineOptions: {
          styles: [
            { color: '#000', weight: 4, opacity: 0.5  },
            { color:  color, weight: 2, opacity: 0.95 }
          ],
          extendToWaypoints: true,
          missingRouteTolerance: 0
        },
        routeLine : (route) => {
          return antPath(route.coordinates, {
            color,
            pulseColor: '#FFFFFF',
            weight: 2,
            delay: 5800,
            dashArray: [2, 5],
            opacity: 0.9,
            pane: 'overlayPane', // mapda tepada
          });
        }
      });

      routing.addTo(map);
    });
  }, [mapRef.current]);
}
