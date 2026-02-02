import L from "leaflet";
import "leaflet.markercluster";

export function createMarkerCluster(map: L.Map) {
  const cluster = L.markerClusterGroup({
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    chunkedLoading: true,
    maxClusterRadius: 100,
    disableClusteringAtZoom: 19,
  });

  map.addLayer(cluster);
  return cluster;
}
