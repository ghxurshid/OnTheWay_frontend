import React from "react";

interface MapControlsProps {
  bounds: boolean;
  onBoundsChange: (value: boolean) => void;
  speed: number;
}

export const MapControls: React.FC<MapControlsProps> = ({
  bounds,
  onBoundsChange,
  speed,
}) => {
  return (
    <>
      {/* Center on user checkbox */}
      <label className="
        absolute bottom-5 right-4
        bg-gray-200 dark:bg-gray-800
        bg-opacity-80
        px-3 py-2
        rounded-lg shadow-lg
        text-lg font-semibold
        text-gray-900 dark:text-gray-100
        z-[401]
      ">
        <input
          type="checkbox"
          checked={bounds}
          onChange={(e) => onBoundsChange(e.target.checked)}
          className="mr-2"
        />
        Center map on my location
      </label>

      {/* Speed indicator */}
      <div className="
        absolute bottom-30 right-4
        bg-gray-200 dark:bg-gray-800
        bg-opacity-80
        px-3 py-2
        rounded-lg shadow-lg
        text-lg font-semibold
        text-gray-900 dark:text-gray-100
        z-[401]
      ">
        {(speed ?? 0).toFixed(1)} km/soat
      </div>
    </>
  );
};

export default MapControls;
