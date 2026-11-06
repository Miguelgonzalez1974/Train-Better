import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/space-grotesk/wght.css';
import App from './App';
import { ErrorBoundary } from './features/shell/ErrorBoundary';
import { recoverFromChunkError } from './lib/chunkError';
import './index.css';

// Tras publicar una versión nueva, un móvil con la app instalada puede pedir trozos de JavaScript que ya no existen. Vite avisa con este
// evento; se limpia la copia guardada y se recarga una vez, en vez de dejar la pantalla en blanco.
window.addEventListener('vite:preloadError', () => {
  recoverFromChunkError(new Error('Failed to fetch dynamically imported module'));
});
window.addEventListener('unhandledrejection', (event) => {
  recoverFromChunkError(event.reason);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);