import { useEffect, useState } from "react";

const MyComponent = () => {
  const [showModal, setShowModal] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  useEffect(() => {
    // Telegram Web Appni ishga tushirish
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      console.log("Init data:", window.Telegram.WebApp.initDataUnsafe);
    }

    // Modalni ochish
    setShowModal(true);
  }, []);

  useEffect(() => {
    if (selectedOption) {
      // Foydalanuvchi variant tanladi, keyingi ishlarni bajarish
      console.log("Tanlangan variant:", selectedOption);
      // Misol: route chizish, API call, state update va h.k.
      setShowModal(false); // modalni yopish
    }
  }, [selectedOption]);

  return (
    <>
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="mb-4">Variantni tanlang</h2>
            <button onClick={() => setSelectedOption("A")} className="m-2 p-2 bg-blue-500 text-white rounded">Variant A</button>
            <button onClick={() => setSelectedOption("B")} className="m-2 p-2 bg-green-500 text-white rounded">Variant B</button>
            <button onClick={() => setSelectedOption("C")} className="m-2 p-2 bg-red-500 text-white rounded">Variant C</button>
          </div>
        </div>
      )}
    </>
  );
};

export default MyComponent;
