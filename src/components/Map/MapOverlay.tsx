import { useState } from "react";
import L from "leaflet";
import { WaypointItem, OverlayStep } from "./types";
import { LocationInput } from "./LocationInput";

import { MapPickController } from "./MapPickController";
import { MapPinIcon } from "@heroicons/react/24/solid";

export const MapOverlay = ({ mapRef }: { mapRef: React.RefObject<L.Map | null> }) => {
  const [step, setStep] = useState<OverlayStep>("view");
  
  const [activeWaypointId, setActiveWaypointId] = useState<string | null>(null);

  const [waypoints, setWaypoints] = useState<WaypointItem[]>([
    { id: "start", kind: "start", waypoint: null },
    { id: "end", kind: "end", waypoint: null },
  ]);

  const updateWaypoint = (id: string, wp: L.Routing.Waypoint | null) => {
    setWaypoints(wps => wps.map(w => (w.id === id ? { ...w, waypoint: wp } : w)));
  };

  const removeWaypoint = (id: string) => {
    setWaypoints(wps => wps.filter(w => w.id !== id));
  };

  const addViaWaypoint = () => {     
    const via = { id: crypto.randomUUID(), kind: "via" as const, waypoint: null };
    setWaypoints(wps => [...wps.slice(0, -1), via, wps[wps.length - 1]]);
  };

  const onMapPickDone = (wp: L.Routing.Waypoint) => {
    if (!activeWaypointId) return;
    updateWaypoint(activeWaypointId, wp);
  };

  return (
    <>
      {/* FAB button */}
      {step === "view" && (
        <div
          className={`
            fixed bottom-6 left-1/2 -translate-x-1/2
            z-[500]
            transition-all duration-300
            opacity-100 scale-100 pointer-events-auto
          `}
        >
          <button
            onClick={() => setStep("input-location")}
            title="Manzilni tanlash"
            className="
              group
              w-16 h-16 rounded-full
              bg-gradient-to-br from-blue-700 to-blue-300
              text-white
              flex items-center justify-center
              shadow-lg shadow-blue-500/40
              transition-all duration-300 ease-out

              hover:scale-110 hover:shadow-xl hover:shadow-blue-500/60
              active:scale-95 active:shadow-inner
            "
          >
            <MapPinIcon
              className="
                w-8 h-8
                transition-transform duration-300
                group-hover:-translate-y-1
                group-hover:scale-110
                group-active:scale-95
              "
            />
          </button>
        </div>
      )}

      {/* Overlay background */}
      <div
        className={`
          fixed inset-0 z-[450] bg-black
          transition-opacity duration-800 ease-out
          ${step === "input-location"
            ? "opacity-45 pointer-events-auto"
            : "opacity-0  pointer-events-none"}          
        `}
        onClick={() => step === "input-location" && setStep("view")}
      />

      {/* Overlay panel */}
      
      <div
        className={`
          fixed left-0 right-0 bottom-0 z-[500]
          bg-white rounded-t-3xl shadow-2xl
          h-[85vh]
          transition-transform duration-800 ease-out
          ${
            step === "input-location" ? "translate-y-0" :
            step === "map-pick"       ? "translate-y-[85%]" :
            step === "route-preview"  ? "translate-y-[70%]" : 
            step === "trip-running"   ? "translate-y-[90%]" : "translate-y-[100%]"
          }
        `}
      >
        <div className="p-5 flex flex-col h-full">
          {step === "input-location" && (
            <>
              {waypoints.map((wp) => (
                <LocationInput
                  key={wp.id}
                  waypointItem={wp}
                  onWaypointChange={updateWaypoint}
                  onMapPick={(id) => {
                    setActiveWaypointId(id);
                    setStep("map-pick");
                  }}
                  onRemove={wp.kind === "via" ? removeWaypoint : undefined}
                />
              ))}

              <div className="flex gap-2 mt-3">
                <button
                  className="bg-green-600 text-white px-3 py-2 rounded"
                  onClick={addViaWaypoint}
                >
                  + Via
                </button>
              </div>

              <button
                className="w-full mt-auto bg-blue-600 text-white py-3 rounded"
                onClick={() => setStep("route-preview")}
              >
                Marshrutni ko‘rsat
              </button>
            </>
          )}

          {step === "map-pick" && (
            <>
              <MapPickController
                mapRef={mapRef}
                onReadyClick={(wp) => 
                  {
                    onMapPickDone(wp);
                    setStep("input-location");
                  }
                }
              />              
            </>
          )}

          {step === "route-preview" && (
            <>
              <h2 className="text-2xl font-bold mb-4">Marshrut tayyor!</h2>
              <p className="flex-grow">
                Bu yerda marshrut tafsilotlari ko‘rsatiladi.
              </p>
              <button
                className="w-full mt-auto bg-green-600 text-white py-3 rounded"
                onClick={() => setStep("trip-running")}
              >
                Sayohatni boshlash
              </button>
            </>
          )}
        </div>
      </div>    
    </>
  );
};
