import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { WaypointItem } from "./types";

type Props = {
  waypointItem: WaypointItem;
  onWaypointChange: (id: string, wp: L.Routing.Waypoint | null) => void;
  onMapPick: (id: string) => void;
  onRemove?: (id: string) => void; // via waypointlar uchun
};

export const LocationInput = ({
  waypointItem,
  onWaypointChange,
  onMapPick,
  onRemove,
}: Props) => {
  const [value, setValue] = useState(waypointItem.waypoint?.name ?? "");
  const [results, setResults] = useState<any[]>([]);
  const geocoderRef = useRef<any>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!geocoderRef.current) {
      geocoderRef.current = L.Control.Geocoder.nominatim({
        reverseQueryParams: {
          zoom: 14,
          addressdetails: 1,
          "accept-language": "uz",
        },
      });
    }
  }, []);

  const handleSearch = (text: string) => {
    setValue(text);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    setResults([]);

    debounceRef.current = setTimeout(() => {
      if (!text || text.length < 3) return;

      geocoderRef.current
        .geocode(text)
        .then((res: any[]) => setResults(res ?? []));
    }, 3000);
  };

  const selectResult = (r: any) => {
    setValue(r.name);
    setResults([]);
    onWaypointChange(waypointItem.id, { latLng: r.center, name: r.name });
  };

  return (
    <div className="relative mb-2">
      <div className="flex items-center gap-2 p-2 bg-gray-100 rounded-lg">
        <span className="w-20 text-sm font-medium text-black">
          {waypointItem.kind.toUpperCase()}
        </span>

        <input
          value={value}
          onChange={(e) => handleSearch(e.target.value)}
          className="
            flex-grow bg-transparent outline-none
            text-black placeholder-black/30
          "
          placeholder="Manzilni kiriting"
        />

        <button
          onClick={() => onMapPick(waypointItem.id)}
          className="px-2 py-1 bg-blue-600 text-white rounded"
        >
          🗺️
        </button>

        {onRemove && (
          <button
            onClick={() => onRemove(waypointItem.id)}
            className="px-2 py-1 bg-red-600 text-white rounded"
          >
            ❌
          </button>
        )}
      </div>

      {results.length > 0 && (
        <ul className="absolute z-[9999] w-full bg-white shadow rounded">
          {results.map((r, i) => (
            <li
              key={i}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-black"
              onClick={() => selectResult(r)}
            >
              {r.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
