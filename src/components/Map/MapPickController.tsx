import { FixedCenterMarker } from "../ui/FixedCenterMarker";
import { useEffect, useRef } from "react";
import L from "leaflet";

type Props = {
  mapRef: React.RefObject<L.Map | null>;   
  onReadyClick: (wp: L.Routing.Waypoint) => void;
};

export const MapPickController = ({ mapRef, onReadyClick }: Props) => {

  
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let debounceTimer: ReturnType<typeof setTimeout>;

    const handler = () => {
      if (debounceTimer) clearTimeout(debounceTimer);

      const zoom = map.getZoom();
      const center = map.getCenter();

      const geocoder = L.Control.Geocoder.nominatim({
        reverseQueryParams: {
          zoom,
          addressdetails: 1,
          extratags: 1,
          namedetails: 1
        }
      });

      debounceTimer = setTimeout(() => {
        if (!markerRef.current)
          return;

        var popupContent = `${center.lat.toFixed(6)} N, ${center.lng.toFixed(6)} E`;
        
        geocoder.reverse(center)
        .then((results: any[]) => {

          if (results && results.length > 0) {             
            const result = results[0];
            popupContent = result.name;
          }
           
          markerRef.current?.setPopupContent(popupContent);
          markerRef.current?.openPopup();          
        })
        .catch((err: string) => {
          console.error("Geocoding error:", err);
          markerRef.current?.setPopupContent(popupContent);
          markerRef.current?.openPopup();  
        });
      }, 2000);
    };

    map.on("moveend", handler);

    return () => { 
      map.off("moveend", handler) 
    };
  }, [mapRef.current]);

  return (
    <>
      {
        <FixedCenterMarker
          mapRef={mapRef}
          markerRef={markerRef}          
        />
      }
      <button
        className="fixed top-[3vh] left-[50%] -translate-x-1/2 w-full max-w-md mx-auto bg-green-600 text-white py-3 rounded-lg shadow-lg z-[600] text-center"
        onClick={() => {
          if (markerRef.current)
          {
            const marker = markerRef.current;
            const waypoint = L.Routing.waypoint(
              marker.getLatLng(),
              marker.getPopup()?.getContent()?.toString()
            );
            
            onReadyClick(waypoint);
          }          
        }}
      >
        Tayyor
      </button>
    </>
  );
};
