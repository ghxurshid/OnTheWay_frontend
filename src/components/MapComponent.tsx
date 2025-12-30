/// <reference types="leaflet-routing-machine" />
import L from "leaflet";
import 'leaflet-routing-machine';
import 'leaflet.markercluster'; 
import { routeData } from '../data/routes.mock.ts';
import { useEffect, useRef, useState } from "react";
import { TrafficParticipant } from "../types/application-types"; 
import { CustomRouter } from "../routing/routers/StaticRouter.ts";
import { OSM_ROUTE_COLORS } from '../data/colors.ts';
import { antPath } from 'leaflet-ant-path'; 
import 'leaflet-curve';
 
function createRotatingTaxiMarker(latlng: L.LatLngExpression, angle: number = 0, color: string = "yellow"): L.Marker {
  const rotatingIcon = L.divIcon({
    html: `
      <div class="taxi-icon-rotate" style="
        width: 38px;
        height: 38px;
        background: url('/icons/${color}-taxi.png') no-repeat center/cover;
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

const iconSize: [number, number] = [12, 12];
const iconAnchor: [number, number] = [6, 6];
const popupAnchor: [number, number] = [1, -34];
const shadowSize: [number, number] = [41, 41];

export const StartMarkerIcon = new L.Icon({
  iconUrl: '/icons/green-circle.png', 
  iconSize,
  iconAnchor,
  popupAnchor,
  shadowSize,
  className: 'start-marker'
});

export const EndMarkerIcon = new L.Icon({
  iconUrl: '/icons/red-circle.png', 
  iconSize,
  iconAnchor,
  popupAnchor,
  shadowSize,
  className: 'end-marker'
});

function createCustomMarker(i : number, wp : L.Routing.Waypoint, n : number): L.Marker {
  console.log("Creating marker for waypoint:", wp, "index:", i, "of", n);
  if (i === 0) {
    return L.marker(wp.latLng, { icon: StartMarkerIcon });
  }

  if (i === n - 1) {
    return L.marker(wp.latLng, { icon: EndMarkerIcon });
  } 
  
  return L.marker(wp.latLng);
}
 
const MapComponent = () => {
  const mapRef = useRef<L.Map | null>(null);
  const markerClusterRef = useRef<L.MarkerClusterGroup | null>(null);

  const [speed, setSpeed] = useState(0);
  const [bounds, setBounds] = useState(false);
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
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,         
        chunkedLoading: true,
        maxClusterRadius: 100,
        zoomToBoundsOnClick: true,
        disableClusteringAtZoom: 19,
        removeOutsideVisibleBounds: true,
        animate: true,
        animateAddingMarkers: true        
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
 
    map.on("click", (e: L.LeafletMouseEvent) => {
      const { latlng } = e;
      console.log("Map clicked at:", latlng); 
      console.log(markerClusterRef.current?.getLayers());
      markerClusterRef.current?.getLayers().forEach(layer => {
        const marker = layer as L.Marker;
        const markerLatLng = marker.getLatLng();
        const distance = latlng.distanceTo(markerLatLng);
        console.log(`Distance to marker at ${markerLatLng}: ${distance.toFixed(2)} meters`);
      });  
    });
  
    // routing control
    L.Routing.control({
      waypoints: [
        L.latLng(41.327725, 69.329877),
        L.latLng(41.242614, 69.367938)
      ],  
      plan: L.Routing.plan([
        L.latLng(41.327725, 69.329877),
        L.latLng(41.242614, 69.367938)
      ], {
        createMarker: createCustomMarker
      }),
      addWaypoints: false,        // waypoint qo‘shishni o‘chiradi
      routeWhileDragging: false,
      show: false,                 // panel chiqmasin
      showAlternatives: false, // ✅ shu bitta route qaytaradi
      lineOptions: {
        styles: [
          {
            color: 'black',
            weight: 6,
            opacity: 0.6
          },
          {
            color: '#00bcd4',
            weight: 3,
            opacity: 0.7
          }
        ],
        extendToWaypoints: true,
        missingRouteTolerance: 0   
      }    
    }).addTo(map);


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
          
          if (bounds) {
            const bounds = L.latLngBounds([
              [latitude - 0.005, longitude - 0.005],
              [latitude + 0.005, longitude + 0.005]
            ]);
        
            map.fitBounds(bounds);
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
      
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }      
    };
  }, []);

  useEffect(() => {
     
  }, [bounds]);

  const fillOtherUsersRandomly = () => {
    if (otherUsersRef.current.length > 0) return; // allaqachon to'ldirilgan
    console.log("Filling other users randomly...");
    const users: TrafficParticipant[] = [];
  
    // Toshkent hududi uchun latitude va longitude chegaralari
    const centerLat = 41.3111;
    const centerLng = 69.2797;
    const R = 800; // masalan 1000 (1km)

    routeData.forEach(element => {
      const waypoints = element.waypoints;
      
      const lat = waypoints[0].lat;
      const lng = waypoints[0].lng;
      const heading = Math.random() * 360; // 0 dan 360 gacha random burchak
 
      const color = OSM_ROUTE_COLORS[
        Math.floor(Math.random() * OSM_ROUTE_COLORS.length)
      ];     
  
      const marker = createRotatingTaxiMarker([lat, lng], heading ? heading : 0);
 
      const route = L.Routing.control({
        waypoints: [
          L.latLng(waypoints[0].lat, waypoints[0].lng),
          L.latLng(waypoints[1].lat, waypoints[1].lng)        
        ],        
        addWaypoints: false,        // waypoint qo‘shishni o‘chiradi
        fitSelectedRoutes: true,
        routeWhileDragging: false,
        show: false,                 // panel chiqmasin
        showAlternatives: false, // ✅ shu bitta route qaytaradi
        lineOptions: {
          styles: [
            { color: '#000', weight: 4, opacity: 0.5  },
            { color:  color, weight: 2, opacity: 0.95 }
          ],
          extendToWaypoints: true,
          missingRouteTolerance: 0
        },
        router: new CustomRouter(), // CustomRouter ni ishlatish 
        plan: L.Routing.plan([
          L.latLng(waypoints[0].lat, waypoints[0].lng),
          L.latLng(waypoints[1].lat, waypoints[1].lng)        
        ], {
          createMarker: createCustomMarker, // markerlarni yashirish 
        }),
        routeLine : (route) => {
          return antPath(route.coordinates, {
            color,
            pulseColor: '#FFFFFF',
            weight: 3,
            delay: 3800,
            dashArray: [4, 10],
            opacity: 0.9,
            pane: 'overlayPane', // mapda tepada
          });
        }      
      }); 
 
      const user: TrafficParticipant = {
        initData: {} as any, // TelegramInitData, hozir empty object
        circle: null,
        location: marker,
        route: route,
      };
    
      users.push(user);      
    }); // <-- routeData.array.forEach qavsini shu yerda yopish
     
    for (let i = 0; i < 0; i++) {
      // Random koordinatalar
      // bitta markaz atrofida random

      const r = Math.sqrt(Math.random()) * R; // MUHIM: sqrt
      const theta = Math.random() * 2 * Math.PI;

      const dLat = (r * Math.cos(theta)) / 111320;
      const dLng = (r * Math.sin(theta)) / (111320 * Math.cos(centerLat * Math.PI / 180));

      const lat = centerLat + dLat;
      const lng = centerLng + dLng;
     
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
      if (user.location && user.route === null) {
        markerClusterRef.current!.addLayer(user.location);
      }
      else {
        user.location!.addTo(mapRef.current!);
      }
      if (user.route) {
        user.route.addTo(mapRef.current!);
      }
    });
  };

  return ( 
    <div id="map" className="w-full h-full">
      {/* Checkbox */}
      <div>
        <label className="absolute bottom-5 right-4 bg-gray bg-opacity-80 px-3 py-2 rounded-lg shadow-lg text-lg font-semibold z-401">
          <input type="checkbox" checked={bounds}  onChange={(e) => setBounds(e.target.checked)}/>
          Center map on my location
        </label>
      </div>

      {/* SPEED Overlay */}
      <div className="absolute bottom-30 right-4 bg-gray bg-opacity-80 px-3 py-2 rounded-lg shadow-lg text-lg font-semibold z-401">
      <h2>{(speed ?? 0).toFixed(1)} km/soat</h2>
      </div>
      
    </div>
  );
};

export default MapComponent;