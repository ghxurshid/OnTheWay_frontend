import React, { useEffect } from 'react';
import L from 'leaflet';

function MapComponent() {
  useEffect(() => {
    // Создание карты
    const map = L.map('map').setView([41.3273628, 69.330082], 20);

    // Добавление OpenStreetMap слоя
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
  }, []);

  return <div id="map" className="w-full h-full" style={{ height: '100vh', width: '100vw' }}></div>;
};

export default MapComponent;