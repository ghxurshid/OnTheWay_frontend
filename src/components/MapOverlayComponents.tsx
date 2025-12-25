import { useState } from 'react';

// Xarita rejimiga o'tishni simulyatsiya qiluvchi funksiya
const handleMapPick = (locationType: 'current' | 'destination') => {
  console.log(`Xaritadan joy tanlash rejimiga o'tildi: ${locationType}`);
  alert(`Please select your ${locationType} location on the map now!`);
};

// Joylashuv Input Komponenti
const LocationInput = ({ label, placeholder, onMapClick }: { label: string; placeholder: string; onMapClick: () => void }) => (
  <div className="flex items-center space-x-3 mb-4 p-3 bg-gray-100 rounded-lg shadow-sm">
    <label className="text-sm font-medium text-gray-600 w-1/4">{label}</label>
    <input
      type="text"
      placeholder={placeholder}
      className="flex-grow bg-transparent focus:outline-none text-gray-800"
    />
    <button
      onClick={onMapClick}
      className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-150 shadow-md"
      title="Xaritadan joy tanlash"
    >
      🗺️ 
    </button>
  </div>
);


const MapOverlayComponents = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* 1. Floating Action Button (FAB) - Pastki markazda, xarita ustida (z-index: 30) */}
      <div className={`
          fixed bottom-6 left-1/2 transform -translate-x-1/2 
          w-16 h-16 rounded-full bg-blue-600 text-white shadow-xl 
          flex items-center justify-center text-3xl z-500 hover:bg-red-700 transition duration-300
          ${isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}
        `}>
        <button
          onClick={() => setIsOpen(true)}        
          title="Manzilni tanlash"
        >
        🎯
        </button>
      </div>
      

      {/* 2. Fonga overlay (z-index: 40) */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black opacity-50 z-40" 
          onClick={() => setIsOpen(false)} 
        />
      )}

      {/* 3. Asosiy Bottom Sheet Konteyneri (z-index: 50) */}
      <div
        id="location-sheet"
        className={`
          fixed left-0 right-0 bottom-0 z-500 bg-white rounded-t-3xl shadow-2xl
          transition-transform duration-500 ease-in-out
          ${isOpen ? 'translate-y-0' : 'translate-y-[85vh]'}
        `}
        style={{ height: '85vh' }} 
      >
        {/* Panelning ichki qismi */}
        <div className="p-6 h-full flex flex-col">
          
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">Sayohatni rejalashtirish</h2>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-500 hover:text-gray-700 text-3xl font-light"
              title="Yopish"
            >
              ×
            </button>
          </div>

          <div className="flex-grow">
            <LocationInput 
              label="Boshlanish" 
              placeholder="Joriy joylashuv..." 
              onMapClick={() => handleMapPick('current')} 
            />
            <LocationInput 
              label="Manzil" 
              placeholder="Manzilni kiriting..." 
              onMapClick={() => handleMapPick('destination')} 
            />
          </div>

          <div className="mt-auto">
             <button
              onClick={() => alert("Marshrutni hisoblash boshlandi!")}
              className="w-full py-3 px-4 bg-green-600 text-white font-semibold rounded-lg shadow-lg hover:bg-green-700 transition duration-150"
            >
              Marshrutni ko'rish
            </button>
          </div>
          
        </div>
      </div>
    </>
  );
};

export default MapOverlayComponents;