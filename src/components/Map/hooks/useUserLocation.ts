import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { createRotatingTaxiMarker } from "../leaflet/markers";

export function useUserLocation(mapRef: React.RefObject<L.Map | null>, bounds: boolean) {
  const userRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const [speed, setSpeed] = useState(0);

  useEffect(() => { 
    const map = mapRef?.current;    
    if (!map || watchIdRef.current) return;     
    
    const watchId = navigator.geolocation.watchPosition(pos => {
      const { latitude, longitude, accuracy, heading, speed } = pos.coords;
      const loc: [number, number] = [latitude, longitude];
       
      if (!userRef.current) {
        userRef.current = {
          marker: createRotatingTaxiMarker(loc, heading ?? 0, "white").addTo(map),
          circle: null,
        };
      } else {
        userRef.current.marker.setLatLng(loc);
      }

      if (accuracy) {
        if (!userRef.current.circle) {
          userRef.current.circle = L.circle(loc, { radius: accuracy }).addTo(map);
        } else {
          userRef.current.circle.setLatLng(loc).setRadius(accuracy);
        }
      }

      setSpeed(speed ? speed * 3.6 : 0); // m/s to km/h
      
      watchIdRef.current = watchId;

      if (bounds) {
        map.fitBounds([
          [latitude - 0.005, longitude - 0.005],
          [latitude + 0.005, longitude + 0.005],
        ]);
      }
    });

    return () => {       
      //navigator.geolocation.clearWatch(watchId);      
    };
  }, [mapRef.current, bounds]);

  return { speed };
}
