# Admin Panel — clean rebuild (`admin-page-clean/`)

Fresh Vite + React 18 + TypeScript scaffold (`npm create vite@7 -- --template react-ts`)
with the admin app ported in from `../admin-page/`. Created to eliminate the
white-screen-on-mobile issues caused by the old project's config baggage.

## PWA

`vite-plugin-pwa` with a shell-only precache — API responses are never cached
(stale approval/payment state risks double-approve). `registerType:
'autoUpdate'` plus `initPwaUpdate()` (`src/lib/pwa.ts`): the app probes
`/admin/sw.js` every 60 s and on tab focus, a newly deployed worker activates
immediately (`skipWaiting` + `clientsClaim` + `cleanupOutdatedCaches`), and
the running page **reloads itself once** when the new worker takes control —
so devices converge on the fresh bundle after at most one visit and can
never stay stuck on a stale cached build. The in-app install banner
(`InstallPromptBanner` in the dashboard layout) appears when the browser
fires `beforeinstallprompt`.

## What changed vs `admin-page/`

- **Router basename normalized** (`src/App.tsx`): `/admin` and `/admin/` both
  work. Previously `/admin` (no trailing slash) matched no route and rendered
  a blank page — the main white-screen cause.
- **`build.target: 'es2020'`** + **`src/polyfills.ts`** instead of the heavy
  `@vitejs/plugin-legacy` Babel pass (which OOM'd the Docker builder). Syntax
  is downleveled by esbuild; the handful of newer runtime APIs
  (`Object.hasOwn`, `structuredClone`, `.at()`, `findLast`, `replaceAll`,
  `Promise.allSettled`) are guarded patches loaded before the app.
- **Startup error overlay** (`index.html`): uncaught errors and rejections are
  printed on-screen instead of leaving a silent white page.
- **`RouteError` boundary** (`src/components/RouteError.tsx`) on the root route
  with a friendly retry screen.
- **Auth hardening**: `GET /api/admin/me` responses must be a plain object
  before entering app state (`src/context/AuthContext.tsx`); the appbar avatar
  tolerates a missing `name` (`src/components/common/Appbar.tsx`).
- **Lean dependencies**: only packages actually imported by `src/` are
  declared (pdf-lib / pdfjs-dist / react-pdftotext and other unused deps
  dropped). Versions are pinned to the ones the previously working build used.
- `npm run typecheck` runs `tsc -b` (real project checking). It currently
  reports pre-existing type issues in the ported source that never affected
  runtime (the old build never type-checked); they are safe to fix gradually.

## Commands

```
npm install
npm run dev        # dev server (API: see .env / VITE_API_URL)
npm run build      # production build to dist/
npm run typecheck  # tsc -b
```

## Deployment

Served under `/admin` by the Go backend from the single-container image
(see root `Dockerfile`, stage `admin-builder`, which builds this folder).
Backend-side companion fixes (the `/admin` → `/admin/` redirect,
Cache-Control on hashed assets, 404 for missing assets) live in
`../backend/internal/handler/http/router.go`.

## Admin approval bootstrap

`POST /api/admin/login` auto-approves an unapproved admin **only when no
approved admin exists at all** (first-admin bootstrap — accounts created
before the approval gate, or a fresh install). Once any approved admin
exists, every other account requires an approved admin's approval as before.
Implementation: `../backend/internal/usecase/admin_usecase.go` (`SignIn`).
