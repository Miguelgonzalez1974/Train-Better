/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

/** Identificador de la versión desplegada (commit corto + fecha) — se muestra en el perfil para saber si el móvil tiene la última. */
function buildId(): string {
  let sha = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7);
  if (!sha) {
    try {
      sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      sha = 'local';
    }
  }
  return `${sha} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId()) },
  test: {
    // El motor es TS puro (sin DOM), asi que el entorno node basta y es mas rapido.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
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
        // La app es en español: solo se precachean las fuentes latinas. Los subsets cirílico/
        // griego/vietnamita van con `unicode-range`, así que el navegador nunca los pide aquí —
        // no tiene sentido meterlos en el precache del service worker.
        globIgnores: ['**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2'],
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
