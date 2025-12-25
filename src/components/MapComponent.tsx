// MapComponent.tsx
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import 'leaflet.markercluster'; 
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
import { TrafficParticipant } from "../types/application-types"; 

/*
[41.398324, 69.150855] [                    ]
[                    ] [41.170258, 69.405164]
*/

function createRotatingTaxiMarker(latlng: L.LatLngExpression, angle: number = 0, color: string = "yellow"): L.Marker {
  const rotatingIcon = L.divIcon({
    html: `
      <div class="taxi-icon-rotate" style="
        width: 38px;
        height: 38px;
        background: url('/src/icons/${color}-taxi.png') no-repeat center/cover;
        transform: rotate(${angle}deg);
        transform-origin: center center;
        transition: transform 1.2s ease;
      "></div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    className: "custom-taxi-marker", // Leaflet default stilini o'chirish
  });

  return L.marker(latlng, { icon: rotatingIcon });
}

const MapComponent = () => {
  const mapRef = useRef<L.Map | null>(null);
  const markerClusterRef = useRef<L.MarkerClusterGroup | null>(null);

  const [speed, setSpeed] = useState(0);
  let watchId: number | null = null;

  const userRef = useRef<TrafficParticipant | null>(null);
  const otherUsersRef = useRef<TrafficParticipant[]>([]); 
  
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
    }

    const map = mapRef.current!;
    const tg = window.Telegram.WebApp;

    if (!markerClusterRef.current) {
      const cluster = L.markerClusterGroup({
        spiderfyOnMaxZoom: false,
        showCoverageOnHover: false,
         
        chunkedLoading: true,
        maxClusterRadius: 100,
      });
    
      map.addLayer(cluster);
      markerClusterRef.current = cluster;
    }    

    if (!userRef.current) {
      userRef.current = {         
        initData: tg.initDataUnsafe,
        circle: null,
        location: null, 
        route: null as any, // Layer.Route yaratish uchun keyin
      };
    }    

    // Xarita bosilganda — maqsad nuqtasi va marshrut
    map.on("click", (e: L.LeafletMouseEvent) => {
      const { latlng } = e;
      console.log("Map clicked at:", latlng);
      // if (!currentLoc.current || !destineLoc.current) return;

      // const waypoints = [
      //   L.Routing.waypoint(currentLoc.current.getLatLng()),
      //   L.Routing.waypoint(destineLoc.current.getLatLng()),
      // ];

      // const router = L.Routing.osrmv1({
      //   serviceUrl: "https://router.project-osrm.org/route/v1",
      // });

      // router.route(waypoints, (args) => {
      //   if (!args) return;
      //   const err = args.error;
      //   const routes = args.routes as L.Routing.IRoute[];

      //   const route = routes[0];
      //   const coords = route.coordinates;
      //   if (!coords) return;

      //   polylineRef.current?.setLatLngs(coords.map((c) => [c.lat, c.lng]));
      //   map.fitBounds(polylineRef.current!.getBounds());
      // });
      
    });
  
    // Joriy joylashuvni kuzatish
    if (!watchId)
    {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {  
          const { latitude, longitude,
             accuracy, heading, speed,
          } = pos.coords;    

          const location: [number, number] = [latitude, longitude];
  
          if (userRef.current === null) return;
  
          var user = userRef.current;
  
           // Noto'g'ri koordinatalarni o'tkazib yuborish
  
           /* ========= MARKER ========= */
          if (user.location === null) {
            user.location = createRotatingTaxiMarker(location, heading ? heading : 0, "white").addTo(map); 
          } else {
            user.location.setLatLng(location); 
          }
  
          if (user.circle)
            user.circle.setLatLng(location);
  
            /* ========= ACCURACY CIRCLE ========= */
          if (accuracy) {
            if (!user.circle) {
              user.circle = L.circle(location, {
                radius: accuracy,
                color: "#2563eb",
                fillColor: "#3b82f6",
                fillOpacity: 0.2,
              }).addTo(map);
            } else {            
              user.circle.setRadius(accuracy);
            }
          }
 
          if (heading !== null && user.location !== null)
          {
            const el = user.location.getElement()?.querySelector('.taxi-icon-rotate') as HTMLElement;
            
            if (el) { el.style.transform = `rotate(${heading}deg)`; }         
          }            
  
          // SPEED hisoblash va yangilash
          if (pos.coords.speed !== null) {
            setSpeed(speed ? speed * 3.6 : 0);
          } else {
            setSpeed(0);
          }         
        },
        (err) => console.error("Geolocation xatosi:", err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } 

    fillOtherUsersRandomly();
    addUsersToCluster();
     
    return () => {       
      map.off("click");            
    };
  }, []);

  const fillOtherUsersRandomly = () => {
    if (otherUsersRef.current.length > 0) return; // allaqachon to'ldirilgan
    console.log("Filling other users randomly...");
    const users: TrafficParticipant[] = [];
  
    // Toshkent hududi uchun latitude va longitude chegaralari
    const centerLat = 41.3111;
    const centerLng = 69.2797;
    const R = 8000; // masalan 1000 (1km)

    const map = mapRef.current!;
  
    for (let i = 0; i < 300; i++) {
      // Random koordinatalar
      // bitta markaz atrofida random

      const r = Math.sqrt(Math.random()) * R; // MUHIM: sqrt
      const theta = Math.random() * 2 * Math.PI;

      const dLat = (r * Math.cos(theta)) / 111320;
      const dLng = (r * Math.sin(theta)) / (111320 * Math.cos(centerLat * Math.PI / 180));

      const lat = centerLat + dLat;
      const lng = centerLng + dLng;
       
      // const lat = centerLat + (Math.random() - 0.5) * 0.08;
      // const lng = centerLng + (Math.random() - 0.5) * 0.08;

      const heading = Math.random() * 360; // 0 dan 360 gacha random burchak
  
      const marker = createRotatingTaxiMarker([lat, lng], heading ? heading : 0);      
  
      const user: TrafficParticipant = {
        initData: {} as any, // TelegramInitData, hozir empty object
        circle: null,
        location: marker,
        route: null as any,
      };
  
      users.push(user);
    }
  
    otherUsersRef.current = users;
  };

  const addUsersToCluster = () => {
    console.log("Adding users to marker cluster...");
    if (!markerClusterRef.current) return;
  
    markerClusterRef.current.clearLayers();
  
    otherUsersRef.current.forEach(user => {
      if (user.location) {
        markerClusterRef.current!.addLayer(user.location);
      }
    });
  };

  return ( 
    <div id="map" className="w-full h-full">
      {/* SPEED Overlay */}
      <div className="absolute bottom-5 right-4 bg-gray bg-opacity-80 px-3 py-2 rounded-lg shadow-lg text-lg font-semibold z-401">
      <h2>{(speed ?? 0).toFixed(1)} km/soat</h2>
      </div>
    </div>
  );
};

export default MapComponent;