import { useEffect } from "react";
import L from "leaflet";

type Props = {
  mapRef: React.RefObject<L.Map | null>;
  markerRef: React.RefObject<L.Marker | null>;
};

export const FixedCenterMarker = ({
  mapRef,
  markerRef
}: Props) => {  

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!markerRef.current) {
      markerRef.current = L.marker(map.getCenter(), {
        interactive: false,
      })
        .addTo(map).bindPopup("").closePopup();
    }

    const syncMarker = () => {
      markerRef.current?.setLatLng(map.getCenter());
    };

    map.on("move", syncMarker);     

    return () => {
      map.off("move", syncMarker);     
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
    };
  }, [mapRef.current]);

  // // 🔑 popup ochish shu yerda
  // useEffect(() => {
  //   if (!markerRef.current) return;
     
  //   if (popupText.length > 0) {
  //     markerRef.current.setPopupContent(popupText);
  //     markerRef.current.openPopup();
  //   } else {
  //     markerRef.current.closePopup();
  //   }
  // }, [popupText]);

  return null;
};
