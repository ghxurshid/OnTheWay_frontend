
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
 
const MapComponent = () => {
  const [map, _setMap] = useState(null);
  const currentLoc = useRef<L.Marker<any> | null>(null);
  const destineLoc = useRef<L.Marker<any> | null>(null);
  const userLocation = useRef<L.Marker<any> | null>(null);

  useEffect(() => {
    const mapInstance = map ? map : L.map('map', {
        center: [41.3273628, 69.330082],
        zoom: 13,
        inertiaDeceleration: 100,
        inertiaMaxSpeed: 100,
    });
     
    currentLoc.current = L.marker([41.3273629, 69.330082]).addTo(mapInstance);
    /*var _circle = */L.circle([41.3273628, 69.330082], {
      color: 'green',
      fillColor: '#f03',
      fillOpacity: 0.2,
      radius: 50
    }).addTo(mapInstance);

    /*var _polygon = */L.polygon([
      [41.327624, 69.329116],
      [41.326045, 69.326895],
      [41.325856, 69.331133]
    ]).addTo(mapInstance);

    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });

    tileLayer.on('tileload', (event) => {
      const url = event.tile.src;
      caches.open('map-cache-v1').then((cache) => {
        cache.add(url);
      });
    });

    tileLayer.addTo(mapInstance);

    const latlngs: L.LatLngTuple[] = [
      [41.3273628, 69.330082],
      [41.327624, 69.329116],
      [41.326045, 69.326895],
      [41.325856, 69.331133]
    ];
    var polyline = L.polyline(latlngs, {color: 'green', opacity: 0.7, weight: 9}).addTo(mapInstance);

    mapInstance.on('click', (e) => {    
      polyline.addLatLng(e.latlng);
      mapInstance.fitBounds(polyline.getBounds());

      if (!destineLoc.current) {
        destineLoc.current = L.marker(e.latlng).addTo(mapInstance);
      } else {
        destineLoc.current.setLatLng(e.latlng);
      }

      //Строим маршрут от текущего местоположения до выбранной точки
      // L.Routing.control({
      //   waypoints: [
      //     L.latLng(currentLoc.current),
      //     L.latLng(destineLoc.current)
      //   ],
      //   router: L.routing.osrmv1({
      //     serviceUrl: 'https://router.project-osrm.org/route/v1'
      //   }),        
      //   routeWhileDragging: true,
      // }).addTo(mapInstance);      
    });

    // setMap(mapInstance);

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
    
          console.info('User location:', userLocation);
    
          // Har doim xaritani markazga olib borish
          mapInstance.setView(userLocation, 13);
    
          // Marker mavjud bo‘lsa, uni yangilash
          if (currentLoc.current) {
            currentLoc.current.setLatLng(userLocation);
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