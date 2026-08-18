import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'CTEarth GIS/RS Workbench',
        short_name: 'CTEarth',
        description: 'A progressive GIS and remote sensing web workbench.',
        theme_color: '#f5f7fa',
        background_color: '#f5f7fa',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: '/index.html'
      }
    })
  ],
  optimizeDeps: {
    exclude: ['geolibre-wasm', 'geolibre-wasm/tools']
  },
  build: {
    chunkSizeWarningLimit: 1800
  }
});
