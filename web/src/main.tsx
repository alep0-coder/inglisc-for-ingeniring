import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

if ('serviceWorker' in navigator) {
  let refreshing = false;
  
  // Reload the page automatically when a new service worker takes control
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  // Programmatically check for service worker updates
  window.addEventListener('load', () => {
    navigator.serviceWorker.ready.then((registration) => {
      // 1. Check for update immediately on load
      registration.update().catch((err) => {
        console.debug('Service Worker update check failed on load:', err);
      });

      // 2. Check for update whenever the user focuses/returns to the app/tab
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch((err) => {
            console.debug('Service Worker update check failed on visibility change:', err);
          });
        }
      });
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
