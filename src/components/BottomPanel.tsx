// BottomNavbar.tsx
import { useState } from "react";

const BottomPanel = () => {
  const [open, setOpen] = useState(false);

  return (    
    <div 
      id ="bottom-panel" 
      className={`
        fixed left-0 right-0 bottom-0 top-15vh z-401 bg-white rounded-t-3xl
        transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]
        ${open ? "translate-y-0" : "translate-y-[70vh]"}
      `}
      style={{ height: "85vh" }}>
      
      {/* Bottom Sheet */}
      <div className="p-4 text-center font-semibold">
        Sheet content (menu, list, settings...)
      </div>

      {/* Navbar */}
      <div className="fixed top-0 left-0 right-0 h-16 bg-white border-t flex items-center justify-between px-6">
        <NavItem label="Home" />
        <NavItem label="Search" />

        {/* Center Button */}
        <button
          onClick={() => setOpen(!open)}
          className="relative -top-6 w-16 h-16 rounded-full bg-red-600 text-red flex items-center justify-center shadow-lg"
        >
          +
        </button>

        <NavItem label="Chat" />
        <NavItem label="Profile" />
      </div>
    </div>
  );
};

const NavItem = ({ label }: { label: string }) => (
  <button className="text-lg text-gray-600">{label}</button>
);

export default BottomPanel;
