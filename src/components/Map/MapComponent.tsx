import { useEffect } from "react";
import L from "leaflet";

import { initMap } from "./MapView";

import { useUserLocation } from "./hooks/useUserLocation";
import { useOtherUsers } from "./hooks/useOtherUsers";
import { useRouting } from "./hooks/useRouting";

const MapComponent = ({ mapRef }: { mapRef: React.RefObject<L.Map | null> }) => {
  
  useEffect(() => { 
    if (!mapRef.current) {       
      mapRef.current = initMap("map", [41.32736, 69.33008], 13);
      console.log(mapRef.current);
    }   
  }, []);

  useRouting(mapRef); 
  useOtherUsers(mapRef);   
  const { speed } = useUserLocation(mapRef, false);
  console.log("User speed:", speed);    

  return <div id="map" className="w-full h-full relative" />;  
};

export default MapComponent;
