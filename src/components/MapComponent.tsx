// MapComponent.tsx
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";

const MapComponent = () => {
  const mapRef = useRef<L.Map | null>(null);
  const currentLoc = useRef<L.Marker | null>(null);
  const destineLoc = useRef<L.Marker | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);

  const router = L.Routing.osrmv1({
    serviceUrl: "https://router.project-osrm.org/route/v1",
  });

  useEffect(() => {
    if (!mapRef.current) {
      mapRef.current = L.map("map", {
        center: [41.3273628, 69.330082],
        zoom: 13,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapRef.current);

      currentLoc.current = L.marker([41.3273629, 69.330082]).addTo(
        mapRef.current
      );

      polylineRef.current = L.polyline([], {
        color: "green",
        opacity: 0.7,
        weight: 6,
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;

    // CLICK event — routing
    map.on("click", (e: L.LeafletMouseEvent) => {
      const { latlng } = e;

      if (!destineLoc.current) {
        destineLoc.current = L.marker(latlng).addTo(map);
      } else {
        destineLoc.current.setLatLng(latlng);
      }

      if (!currentLoc.current || !destineLoc.current) return;

      const waypoints = [
        L.Routing.waypoint(currentLoc.current.getLatLng()),
        L.Routing.waypoint(destineLoc.current.getLatLng()),
      ];

      router.route(waypoints, (args) => {
        if (!args) return;
        const err = args.error;
        const routes = args.routes as L.Routing.IRoute[];

        if (err) {
          console.error("Routing error:", err);
          return;
        }
        if (!routes?.length) return;

        const route = routes[0];
        const coords = route.coordinates;
        if (!coords) return;

        polylineRef.current?.setLatLngs(coords.map((c) => [c.lat, c.lng]));
        map.fitBounds(polylineRef.current!.getBounds());
      });
    });

    // GEOLOCATION
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const userPos: [number, number] = [latitude, longitude];

        if (currentLoc.current) {
          currentLoc.current.setLatLng(userPos);
        }
      },
      (err) => console.error("Geolocation error:", err),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  return <div id="map" className="w-full h-full" />;
};

export default MapComponent;
