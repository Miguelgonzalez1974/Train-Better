import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Sin esto, un service worker ya instalado puede seguir sirviendo el bundle viejo
        // (con pantallas/funciones desactualizadas) hasta que el usuario cierre y reabra la
        // app varias veces — clientsClaim + skipWaiting hacen que la version nueva tome el
        // control de las pestañas ya abiertas en cuanto termina de instalarse.
        clientsClaim: true,
        skipWaiting: true,
      },
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/icon.svg'],
      manifest: {
        name: 'Train Better',
        short_name: 'TrainBetter',
        description: 'Entrenador IA de CrossFit: programacion diaria/semanal por bloques',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
});
