import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt': a waiting worker surfaces the in-app "update available" toast
      // instead of silently swapping code mid-hand.
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Jaffre',
        short_name: 'Jaffre',
        description:
          'A four-player trick-taking card game. Bid, take the tricks, first team to 41.',
        start_url: '/',
        // fullscreen hides Android's status bar for a true arcade cabinet;
        // browsers without it fall down the spec chain to standalone.
        display: 'fullscreen',
        orientation: 'portrait',
        background_color: '#0b1f18',
        theme_color: '#0b1f18',
        icons: [
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell: code, styles, fonts and icons — enough for a fully
        // offline "Play vs Bots". The og-cards share images stay runtime-cached.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        // Push + notification-click handlers live outside the generated SW.
        importScripts: ['push-sw.js'],
        // Deep links (#room/... is a fragment so any path is really '/'), but
        // never swallow the Worker's live endpoints.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/ws\//],
        runtimeCaching: [
          {
            urlPattern: /\/og-cards\/.*\.jpg$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'og-cards',
              expiration: { maxEntries: 16, maxAgeSeconds: 30 * 24 * 3600 },
            },
          },
          {
            // Read-only personal data: instant paint from cache, refresh behind.
            urlPattern: /^https?:\/\/[^/]+\/api\/(history|stats)(\?|$)/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-reads',
              expiration: { maxEntries: 32, maxAgeSeconds: 24 * 3600 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/ws': { target: 'http://127.0.0.1:8787', ws: true },
      '/api': 'http://127.0.0.1:8787',
    },
  },
});
