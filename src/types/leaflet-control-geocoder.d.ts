import * as L from "leaflet";

declare module "leaflet" {
  namespace Control {
    namespace Geocoder {
      function nominatim(options?: any): any;
    }
  }
}
  