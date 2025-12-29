import * as L from 'leaflet';

declare module 'leaflet' {
  namespace Routing {

    /* =======================
     * Control
     * ======================= */
    class Control extends L.Control {
      constructor(options?: RoutingControlOptions);

      getPlan(): Plan;
      setWaypoints(waypoints: L.LatLng[]): void;
      getWaypoints(): Waypoint[];

      spliceWaypoints(index: number, remove: number, ...waypoints: L.LatLng[]): void;

      on(type: 'routesfound', fn: (e: RoutesFoundEvent) => void): this;
      on(type: string, fn: (...args: any[]) => void): this;

      off(type: string, fn?: (...args: any[]) => void): this;
      remove(): this;
    }

    /* =======================
     * Factory helper
     * ======================= */
    function control(options?: RoutingControlOptions): Control;

    /* =======================
     * Options
     * ======================= */
    interface RoutingControlOptions extends L.ControlOptions {
      waypoints?: L.LatLng[];
      router?: IRouter;
      plan?: Plan;

      addWaypoints?: boolean;
      draggableWaypoints?: boolean;
      fitSelectedRoutes?: boolean;
      show?: boolean;
      routeWhileDragging?: boolean;

      createMarker?: (
        i: number,
        waypoint: Waypoint,
        n: number
      ) => L.Marker | null | undefined;

      lineOptions?: LineOptions;
    }

    /* =======================
     * Router
     * ======================= */
    interface IRouter {
      route(
        waypoints: Waypoint[],
        callback: (err: any, routes?: Route[]) => void,
        context?: any,
        options?: any
      ): void;
    }

    /* =======================
     * Plan
     * ======================= */
    class Plan {
      constructor(
        waypoints: L.LatLng[],
        options?: PlanOptions
      );

      setWaypoints(waypoints: L.LatLng[]): void;
      getWaypoints(): Waypoint[];
    }

    interface PlanOptions {
      createMarker?: (
        i: number,
        waypoint: Waypoint,
        n: number
      ) => L.Marker | null | undefined;
    }

    /* =======================
     * Waypoint
     * ======================= */
    interface Waypoint {
      latLng: L.LatLng;
      name?: string;
      options?: any;
    }

    /* =======================
     * Route & events
     * ======================= */
    interface Route {
      coordinates: L.LatLng[];
      summary?: {
        totalDistance: number;
        totalTime: number;
      };
    }

    interface RoutesFoundEvent {
      routes: Route[];
      waypoints: Waypoint[];
    }

    /* =======================
     * Line options
     * ======================= */
    interface LineOptions {
      styles?: Array<{
        color?: string;
        weight?: number;
        opacity?: number;
      }>;
      extendToWaypoints?: boolean;
      missingRouteTolerance?: number;
    }
  }
}
