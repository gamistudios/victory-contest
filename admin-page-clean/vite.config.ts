import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from "path"

// https://vite.dev/config/
export default defineConfig({
  // Served under /admin when frontend + admin + API share one origin
  // (single-container deployments). Asset URLs become /admin/assets/...
  base: '/admin/',
  plugins: [react()],
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
