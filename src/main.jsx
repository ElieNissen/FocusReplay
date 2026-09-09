import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import CheckinOverlay from './CheckinOverlay';
createRoot(document.getElementById('root')).render(
  location.hash === '#checkin' ? <CheckinOverlay /> : <App />,
);
