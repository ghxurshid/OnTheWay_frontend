// App.tsx
import { useRef, useState } from "react"; 
import MapComponent from "./components/Map/MapComponent";
import { MapOverlay } from "./components/Map/MapOverlay";
import { MapControls } from "./components/Map/MapControls";
 
const App = () => { 
  const mapRef = useRef<L.Map | null>(null);
  const [bounds, setBounds] = useState(false);
  let speed = 0;
  return (    
    <>        
      <MapComponent mapRef={mapRef}/> 
      <MapControls bounds={bounds} onBoundsChange={setBounds} speed={speed} />
      <MapOverlay mapRef = {mapRef}/>
    </>
  );
};

export default App;
