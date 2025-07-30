import { useEffect, useRef, useState } from 'react'; 
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
 
const MapComponent = () => {
  const [map, _setMap] = useState(null);
  const currentLoc = useRef<L.Marker<any> | null>(null);
  const destineLoc = useRef<L.Marker<any> | null>(null); 
  const router = L.Routing.osrmv1(); // default OSRM router

  useEffect(() => {
    const mapInstance = map ? map : L.map('map', {
        center: [41.3273628, 69.330082],
        zoom: 13,
        inertiaDeceleration: 100,
        inertiaMaxSpeed: 100,
    });
     
    currentLoc.current = L.marker([41.3273629, 69.330082]).addTo(mapInstance);
    
    // var _circle = L.circle([41.3273628, 69.330082], {
    //   color: 'green',
    //   fillColor: '#f03',
    //   fillOpacity: 0.2,
    //   radius: 50
    // }).addTo(mapInstance);

    // var _polygon = L.polygon([
    //   [41.327624, 69.329116],
    //   [41.326045, 69.326895],
    //   [41.325856, 69.331133]
    // ]).addTo(mapInstance);

    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });

    /*
    // var control = L.Routing.control({
    //   waypoints: [
    //     L.latLng(41.327840, 69.331134), // Boshlanish nuqta
    //     L.latLng(41.268693, 69.292682)      // Tugash nuqta
    //   ],
    //   routeWhileDragging: true,
          
    // }).addTo(mapInstance);
 
    // // Cache tiles for offline use// Hodisa bilan yo'l topilganda chaqiriladi
    // control.on('routesfound', function (e) {
    //   const routes = e.routes;

    //   if (routes.length > 0) {
    //     const coordinates = routes[0].coordinates;

    //     console.log('Koordinatalar:', coordinates); // 👈 Barcha koordinatalar (LatLng[])

    //     // Agar istasangiz har birini alohida chiqarsangiz ham bo‘ladi
    //     // coordinates.forEach((coord: L.LatLng, index: number) => {
    //     //   console.log(`Nuqta ${index + 1}: ${coord.lat}, ${coord.lng}`);
    //     // });
    //   }
    // });
    */
   
    const waypoints = [
      new L.Routing.Waypoint(L.latLng(41.311081, 69.240562), '', {}), // 'name' bo‘sh string
      new L.Routing.Waypoint(L.latLng(41.2995, 69.2401), '', {})
    ];
 
    // router.route(
    //   waypoints,
    //   ((err: any, routes: L.Routing.IRoute[]) => {
    //     if (err) {
    //       console.error("Xato:", err);
    //       return;
    //     } 
         
    //     if (routes?.length) {
    //       const route = routes[0];
    //       route?.coordinates?.forEach((coord, i) => {
    //         console.log(`Step ${i + 1}: ${coord.lat}, ${coord.lng}`);
    //       });
    //     }
    //   }) as unknown as (args?: any) => void // ✅ bu yerda TypeScriptni “aldayapmiz”
    // );
        
    tileLayer.on('tileload', (event) => {
      const url = event.tile.src;
      caches.open('map-cache-v1').then((cache) => {
        cache.add(url);
      });
    });

    tileLayer.addTo(mapInstance);

    const latlngs: L.LatLngTuple[] = [
      // [41.3273628, 69.330082],
      // [41.327624, 69.329116],
      // [41.326045, 69.326895],
      // [41.325856, 69.331133]
    ];

    var polyline = L.polyline(latlngs, {color: 'green', opacity: 0.7, weight: 9}).addTo(mapInstance);

    mapInstance.on('click', (e) => {
      if (!destineLoc.current) {
        destineLoc.current = L.marker(e.latlng).addTo(mapInstance);
      } else {
        destineLoc.current.setLatLng(e.latlng);
      }
      
      if (currentLoc &&  destineLoc) { 
        const waypoints = [
          new L.Routing.Waypoint(currentLoc.current.getLatLng(), '', {}), // 'name' bo‘sh string
          new L.Routing.Waypoint(destineLoc.current.getLatLng(), '', {})
        ];
 
        // Routingni yangilash
        router.route(waypoints, (err: any, routes: L.Routing.IRoute[]) => {
          if (err) {
            console.error("Xato:", err);
            return;
          }
          
          if (routes?.length) {
            const route = routes[0];

            console.log('Route coordinates:', route.coordinates);

            polyline.setLatLngs(route.coordinates.map(coord => [coord.lat, coord.lng]));
            mapInstance.fitBounds(polyline.getBounds());
          }
        }) as unknown as (args?: any) => void // ✅ bu yerda TypeScriptni “aldayapmiz”;
      }      
    });
 
    // Функция для отслеживания местоположения
    function startTracking() {
      if (!navigator.geolocation) {
        console.error('Geolocation is not supported by this browser.');
        return;
      }
    
      navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const userLocation: [number, number] = [latitude, longitude];
   
          // Har doim xaritani markazga olib borish
          //mapInstance.setView(userLocation, 13);
    
          // Marker mavjud bo‘lsa, uni yangilash
          if (currentLoc.current) {
            currentLoc.current.setLatLng(userLocation).bindPopup('You are here!').openPopup();
          } else {
            // Marker yo‘q bo‘lsa, yangi marker yaratish
            currentLoc.current = L.marker(userLocation)
              .addTo(mapInstance)
              .bindPopup('You are here!')
              .openPopup();
          }
        },
        (error) => {
          console.error('Error occurred while retrieving location:', error);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        }
      );
    }

    // Начинаем отслеживание
    startTracking();
 
    // Очистка ресурсов при размонтировании компонента
    return () => {
      
    };
  }, []);

  return <div id="map" className="w-full h-full" style={{ height: '100vh', width: '100vw' }}></div>;
};

export default MapComponent;