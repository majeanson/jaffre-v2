import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Stamp dist/version.json with the commit sha so scripts/verify-deploy.ts can
 * prove the LIVE bundle matches the deployed commit (not just green CI). Kept
 * out of the SW precache glob on purpose — reads must always hit the network.
 */
function versionStamp(): Plugin {
  return {
    name: 'version-stamp',
    apply: 'build',
    closeBundle() {
      const sha =
        process.env.GITHUB_SHA ?? execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
      writeFileSync(
        resolve(import.meta.dirname, 'dist/version.json'),
        JSON.stringify({ sha, builtAt: new Date().toISOString() }),
      );
    },
  };
}

/** Which built woff2 files carry the first paint: the pixel display face
 * (title, buttons) and the UI face's latin subset. Their filenames get a Vite
 * content hash only known at build time — this plugin reads the final bundle
 * and injects `<link rel="preload">` tags, so the browser fetches them
 * alongside the JS instead of discovering them after CSS parses (the
 * guaranteed cold-load FOUT the polishing backlog (docs/archive) flagged). */
const PRELOAD_FONTS = [
  /^assets\/silkscreen-latin-400-normal-.*\.woff2$/,
  /^assets\/rubik-latin-wght-normal-.*\.woff2$/,
];

function fontPreload(): Plugin {
  return {
    name: 'font-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {}).filter((f) =>
          PRELOAD_FONTS.some((re) => re.test(f)),
        );
        return files.map((href) => ({
          tag: 'link',
          attrs: {
            rel: 'preload',
            as: 'font',
            type: 'font/woff2',
            href: `/${href}`,
            crossorigin: '',
          },
          injectTo: 'head-prepend' as const,
        }));
      },
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    versionStamp(),
    fontPreload(),
    VitePWA({
      // 'prompt' keeps the update under app control — UpdateToast then applies
      // a waiting deploy automatically (flash a notice, then reload) and polls
      // for new deploys, so every client runs current code without a choice.
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
            handler: 'StaleWhileRevalidate',
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
