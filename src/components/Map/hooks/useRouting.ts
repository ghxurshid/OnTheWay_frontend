import { useEffect, useRef } from "react";
import L from "leaflet";
import 'leaflet-rotate';
import "leaflet-routing-machine";
import "leaflet-control-geocoder"; // Geocoder
 
import { StartMarkerIcon, EndMarkerIcon } from "../leaflet/icons";


export function useRouting(mapRef: React.RefObject<L.Map | null>) {

  const controlRef = useRef<L.Routing.Control | null>(null);
  const planRef = useRef<L.Routing.Plan | null>(null);
 
  useEffect(() => {
   
    const map = mapRef.current;
    if (!map) return;
 
    // 1️⃣ Routing control
    if (!planRef.current) {

      planRef.current = L.Routing.plan( 
        [
          L.latLng(41.2995, 69.2401),
          L.latLng(41.3111, 69.2797),
        ],             
        {        
          createMarker: (i, wp, n) => {
            if (i === 0) return L.marker(wp.latLng, { icon: StartMarkerIcon });
            if (i === n - 1) return L.marker(wp.latLng, { icon: EndMarkerIcon });
            return L.marker(wp.latLng);
          }       
        }
      );
    }

    const plan = planRef.current;
  
    if (!controlRef.current) {
  
      controlRef.current = L.Routing.control({        
        plan: plan,
        show: false,
                              
        lineOptions: {
          styles: [
            { color: 'black', weight: 6, opacity: 0.6 },
            { color: '#00bcd4', weight: 3, opacity: 0.7 }
          ],
          extendToWaypoints: true,
          missingRouteTolerance: 500
        }      
      }).addTo(map);      
    }
 
    return () => {
 
    };
  }, [mapRef.current]);  
}

