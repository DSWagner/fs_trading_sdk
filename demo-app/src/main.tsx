import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { bootstrapTheme } from './conviction/useDarkMode';

import App from './conviction/App';

// Apply the persisted theme BEFORE React mounts so the initial paint is
// already in the correct mode. Otherwise the page would flicker from light
// to dark on first render for users who'd previously chosen dark.
bootstrapTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
