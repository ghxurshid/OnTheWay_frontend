import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
 
const MapComponent = () => {
  const [map, setMap] = useState(null);
  const markerRef = useRef(null);
   
  useEffect(() => {    
    const mapInstance  = L.map('map').setView([41.3273628, 69.330082], 20);
     
    // var marker = L.marker([41.3273628, 69.330082]).addTo(mapInstance);
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

    var latlngs = [ 
      [41.326327, 69.329916],
      [41.328213, 69.344373],
      [41.328390, 69.345038],
      [41.331677, 69.349630],
      [41.348689, 69.367933],
      [41.349189, 69.368963],
      [41.349350, 69.369907],
      [41.350381, 69.378855],
      [41.351605, 69.383919],
      [41.351911, 69.384885],
      [41.353329, 69.388232],
      [41.353562, 69.388463],
      [41.354239, 69.387910],
      [41.354714, 69.387589],
      [41.358611, 69.386044],
      [41.359167, 69.387921],
      [41.359578, 69.389144],
      [41.359989, 69.389874],
      [41.360568, 69.390442],
      [41.365029, 69.394348],
      [41.365802, 69.394873],
      [41.367075, 69.395345],
      [41.368145, 69.395657],
      [41.368701, 69.395957],
      [41.369506, 69.396751],
      [41.369989, 69.397459],
      [41.370432, 69.398392],
      [41.370819, 69.399337],
      [41.371068, 69.400313],
      [41.371125, 69.400903],
      [41.371052, 69.401633],
      [41.370931, 69.402223],
      [41.370706, 69.402834],
      [41.369321, 69.406450],
      [41.369104, 69.407179],
      [41.368975, 69.407930],
      [41.368926, 69.408789],
      [41.368902, 69.410194],
      [41.369087, 69.411310],
      [41.369385, 69.412994],
      [41.369353, 69.413713],
      [41.369192, 69.414164],
      [41.368983, 69.414539],
      [41.367751, 69.415795],
      [41.366865, 69.416406],
      [41.366881, 69.416803],
      [41.367856, 69.419024],
      [41.368741, 69.420805],
      [41.376551, 69.434452],
      [41.377549, 69.435868],
      [41.378837, 69.438829],
      [41.379836, 69.440546],
      [41.380930, 69.442692],
      [41.381655, 69.444366],
      [41.384295, 69.451447],
      [41.386163, 69.456081],
      [41.389544, 69.462841],
      [41.389849, 69.463506],
      [41.390976, 69.467261],
      [41.391459, 69.468484],
      [41.392811, 69.471445],
      [41.395483, 69.478505],
      [41.397496, 69.484406],
      [41.399379, 69.488397],
      [41.400200, 69.489985],
      [41.403370, 69.495692],
      [41.405076, 69.497731],
      [41.407314, 69.501400],
      [41.407772, 69.502001],
      [41.408368, 69.502274],
      [41.408907, 69.502575],
      [41.409937, 69.504511],
      [41.410991, 69.507033],
      [41.412673, 69.510283],
      [41.414668, 69.515562],
      [41.416181, 69.519038],
      [41.417500, 69.523115],
      [41.418723, 69.523759],
      [41.419946, 69.523523],
      [41.420670, 69.523802],
      [41.421104, 69.524682],
      [41.421314, 69.525883],
      [41.421668, 69.526527],
      [41.428264, 69.535754],
      [41.429584, 69.537899],
      [41.431932, 69.542277],
      [41.432817, 69.543328],
      [41.437096, 69.545796],
      [41.439236, 69.550045],
      [41.441842, 69.555151],
      [41.447825, 69.559679],
      [41.448919, 69.558220],
      [41.449015, 69.557952],
      [41.448927, 69.557555],
      [41.448911, 69.556997],
      [41.449072, 69.556718],
      [41.449353, 69.556525],
      [41.449594, 69.556621],
      [41.452095, 69.558316],
      [41.452481, 69.558445],
      [41.452763, 69.558284],
      [41.453888, 69.556503],
      [41.455810, 69.553392],
      [41.456502, 69.551965],
      [41.456578, 69.551960],
      [41.456683, 69.552019],
      [41.456835, 69.552480],
      [41.456932, 69.552587],
      [41.457089, 69.552550],
      [41.457157, 69.552453],
      [41.457177, 69.552314],
      [41.456904, 69.551595],
      [41.456892, 69.551412],
      [41.456908, 69.551160],
      [41.456984, 69.550994],
      [41.457213, 69.550602],
      [41.457270, 69.550613],
      [41.461680, 69.555216],
      [41.461905, 69.554819]
    ];
    
    var polyline = L.polyline(latlngs, {color: 'green', opacity: 0.7, weight: 9}).addTo(mapInstance);

    mapInstance.on('click', (e) => {     
      //map.fitBounds(polyline.getBounds());
      console.info(e.latlng.toString());       
      polyline.addLatLng(e.latlng);
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

            // Центрирование карты на текущем местоположении
            mapInstance.setView(userLocation, 13);

            // Если маркер уже существует, обновляем его местоположение
            if (markerRef.current) {
              markerRef.current.setLatLng(userLocation);
            } else {
              // Добавляем новый маркер на карту
              markerRef.current = L.marker(userLocation).addTo(mapInstance)
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