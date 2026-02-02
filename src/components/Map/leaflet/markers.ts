import L from "leaflet";
import { StartMarkerIcon, EndMarkerIcon } from "./icons";

export function createRotatingTaxiMarker(
  latlng: L.LatLngExpression,
  angle = 0,
  color = "yellow"
): L.Marker {
  return L.marker(latlng, {
    icon: L.divIcon({
      html: `
        <div class="taxi-icon-rotate"
          style="
            width:38px;height:38px;
            background:url('/icons/${color}-taxi.png') no-repeat center/cover;
            transform:rotate(${angle}deg);
            transition:transform 1.2s ease;
          ">
        </div>`,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      className: "custom-taxi-marker",
    }),
  });
}

export function createCustomMarker(i : number, wp : L.Routing.Waypoint, n : number): L.Marker {
  console.log("Creating marker for waypoint:", wp, "index:", i, "of", n);
  if (i === 0) {
    return L.marker(wp.latLng, { icon: StartMarkerIcon });
  }

  if (i === n - 1) {
    return L.marker(wp.latLng, { icon: EndMarkerIcon });
  } 
  
  return L.marker(wp.latLng);
}
