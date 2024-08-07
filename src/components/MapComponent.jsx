import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
 
const MapComponent = () => {
  const [map, setMap] = useState(null);
  const currentLoc = useRef(null);
  const destineLoc = useRef(null);

  useEffect(() => {
    const mapInstance = map ? map : L.map('map').setView([41.3273628, 69.330082], 20);
     
    currentLoc.current = L.marker([41.3273629, 69.330082]).addTo(mapInstance);
    // var circle = L.circle([41.3273628, 69.330082], {
    //   color: 'green',
    //   fillColor: '#f03',
    //   fillOpacity: 0.2,
    //   radius: 50
    // }).addTo(mapInstance);

    // var polygon = L.polygon([
    //   [41.327624, 69.329116],
    //   [41.326045, 69.326895],
    //   [41.325856, 69.331133]
    // ]).addTo(mapInstance);

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

    //var polyline = L.polyline(latlngs, {color: 'green', opacity: 0.7, weight: 9}).addTo(mapInstance);

    mapInstance.on('click', (e) => {      
      console.info(destineLoc);  
         
      //polyline.addLatLng(e.latlng);
      //mapInstance.fitBounds(polyline.getBounds());

      if (!destineLoc.current) {
        destineLoc.current = L.marker(e.latlng).addTo(mapInstance);
      } else {
        destineLoc.current.setLatLng(e.latlng);
      }

      // Строим маршрут от текущего местоположения до выбранной точки
      L.Routing.control({
        waypoints: [
          L.latLng(currentLoc.current),
          L.latLng(destineLoc.current)
        ],
        router: L.routing.osrmv1({
          serviceUrl: 'https://router.project-osrm.org/route/v1'
        }),
        serviceUrl: 'https://router.project-osrm.org/route/v1',
        routeWhileDragging: true,
      }).addTo(mapInstance);
      
    });

    setMap(mapInstance);

    // Функция для отслеживания местоположения
    function startTracking() {
      if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            const userLocation = [latitude, longitude];

            console.info(userLocation);
 
            //mapInstance.setView(userLocation, 13);

            if (currentLoc.current) {
              currentLoc.current.setLatLng(userLocation);
            } else {              
              currentLoc.current = L.marker(userLocation).addTo(mapInstance)
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
            maximumAge: 0
          }
        );
      } else {
        console.error('Geolocation is not supported by this browser.');
      }
    }

    // Начинаем отслеживание
    startTracking();

    // Очистка ресурсов при размонтировании компонента
    return () => {
      if (navigator.geolocation && navigator.geolocation.clearWatch) {
        navigator.geolocation.clearWatch();
      }
    };
  }, []);

  return <div id="map" className="w-full h-full" style={{ height: '100vh', width: '100vw' }}></div>;
};

export default MapComponent;