import L from "leaflet";

export type WaypointKind = "start" | "via" | "end";

export type WaypointItem = {
  id: string;
  kind: WaypointKind;
  waypoint: L.Routing.Waypoint | null;
};

export type OverlayStep =
  | "view"
  | "input-location"
  | "map-pick"
  | "route-preview"
  | "trip-running";
