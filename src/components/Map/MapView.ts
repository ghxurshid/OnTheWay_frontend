import L from "leaflet";
import 'leaflet-rotate';

export function initMap(
  containerId: string,
  center: [number, number] = [41.32736, 69.33008],
  zoom = 13
): L.Map {
  const map = L.map(
    containerId, 
    { 
      center: center, 
      zoom: zoom  
    });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
 
  return map;
}
