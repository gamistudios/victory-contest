import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import legacy from '@vitejs/plugin-legacy'
import { VitePWA } from 'vite-plugin-pwa'
import path from "path"

// Browsers the legacy bundle must keep working on: roughly 2020-and-later
// engines (Chrome/Edge 79+, Firefox 78+, Safari/iOS 13+, Android WebView 76+,
// Samsung 12+). The modern bundle still serves up-to-date browsers; these
// floors only decide what the babel+core-js legacy fallback is built for.
const legacyTargets = [
  'chrome >= 79',
  'edge >= 79',
  'firefox >= 78',
  'safari >= 13',
  'ios_saf >= 13',
  'android >= 76',
  'opera >= 66',
  'samsung >= 12',
]

// https://vite.dev/config/
export default defineConfig({
  // Served under /admin when frontend + admin + API share one origin
  // (single-container deployments). Asset URLs become /admin/assets/...
  base: '/admin/',
  plugins: [
    react(),
    legacy({
      targets: legacyTargets,
      modernPolyfills: true,
    }),
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
