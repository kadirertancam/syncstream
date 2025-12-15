import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Remove initial loader
const loader = document.querySelector('.initial-loader');
if (loader) {
  loader.style.opacity = '0';
  loader.style.transition = 'opacity 0.3s ease';
  setTimeout(() => loader.remove(), 300);
}

// Mount React app
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker for PWA
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(console.error);
  });
}
