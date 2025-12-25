// App.tsx
import { useState, useEffect } from "react";
import MapComponent from "./components/MapComponent";
import MapOverlayComponents from "./components/MapOverlayComponents";
import MyComponent from "./components/MyComponent";

const App = () => {

  return (    
    <>        
      <MapComponent />      
      <MapOverlayComponents />
    </>
  );
};

export default App;
