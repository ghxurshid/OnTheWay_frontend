// App.tsx
import MapComponent from "./components/MapComponent";
import BottomPanel from "./components/BottomPanel";

const App = () => {
  return (    
    <>    
      {/* Map to‘liq ekranni egallaydi */}
      <MapComponent />

      {/* Navbar map ustida */}
      <BottomPanel />      
    </>
  );
};

export default App;
