import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles/global.css';
import { resetIfAccountChanged } from './services/accountGuard';

// Before any store reads localStorage: another Telegram account on this device
// must not inherit the previous one's session or queued writes.
resetIfAccountChanged();

import('./app/Root').then(({ Root }) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
});
