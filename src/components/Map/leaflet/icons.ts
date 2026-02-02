import L from "leaflet";

const iconSize: [number, number] = [12, 12];
const iconAnchor: [number, number] = [6, 6];

export const StartMarkerIcon = new L.Icon({
  iconUrl: "/icons/green-circle.png",
  iconSize,
  iconAnchor,
  className: "start-marker",
});

export const EndMarkerIcon = new L.Icon({
  iconUrl: "/icons/red-circle.png",
  iconSize,
  iconAnchor,
  className: "end-marker",
});
