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
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
