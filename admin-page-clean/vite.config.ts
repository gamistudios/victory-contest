import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from 'vite-plugin-pwa'
import path from "path"

// https://vite.dev/config/
export default defineConfig({
  // Served under /admin when frontend + admin + API share one origin
  // (single-container deployments). Asset URLs become /admin/assets/...
  base: '/admin/',
  plugins: [
    react(),
    VitePWA({
      // New workers activate immediately and the injected registerSW.js
      // reloads open pages when the new worker takes control — a deploy can
      // never leave a phone stuck on a stale cached shell (the failure mode
      // of the old setup).
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Victory Contest Admin',
        short_name: 'VC Admin',
        description: 'Admin dashboard for the Victory Contest Telegram mini app',
        start_url: '/admin/dashboard',
        scope: '/admin/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#00AB55',
        background_color: '#faf9f7',
        icons: [
          { src: '/admin/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/admin/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/admin/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/admin/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Shell assets only: never precache or runtime-cache API responses —
        // stale approval/payment state risks double-approve.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // main bundle is ~3 MB (no code-splitting yet); default 2 MiB would skip it
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // Purge precache revisions from earlier deployments (the old
        // vite-plugin-pwa era included) on activation.
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Broad device support without a second Babel pass (which OOMs the Docker
    // builder): esbuild transpiles post-ES2020 syntax (??=, class fields, …)
    // down to ES2020; the few newer runtime APIs (Object.hasOwn,
    // structuredClone, Array.prototype.at, …) are patched in src/polyfills.ts.
    target: 'es2020',
  },
})
