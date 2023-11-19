import { useEffect, useState } from 'react';
import Map from './views/map';
import './App.css';

function App() {
  const [own, setOwn] = useEffect(0)
  const x = ["A", "B", "C"]

  useEffect(() => {
    console.log(own)

    return
  }, [own])



  return (
    <div className="App">
      <header className="App-header">
        <img src="Octocat.png" className="App-logo" alt="logo" />
        <p>
          {x.map((item, index) => 
           <ul>
            <li key={index}>
            <Map ism={item}/>
            </li>
           </ul>
          )}
        </p>
        <button onClick={() => setOwn(own + 1)}>Bos</button>
      </header>
    </div>
  );
}

export default App;
