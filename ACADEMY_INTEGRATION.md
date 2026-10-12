# Academy integration notes

## Student app (frontend/)
- Added `src/academy/**`, `src/services/academy/**` (mock API), `src/types/academy.ts`.
- `src/index.css`: KaTeX import + Academy block (reader typography, utilities) appended.
- `src/services/api.ts`: plain axios (`baseURL` + `/api`); the Academy mock adapter is gone and every `/academy/*` call hits the Go routes — see `ACADEMY_BACKEND_NOTES.md`.
- `App.tsx`: `/academy`, `/academy/courses`, `/academy/subject/:id`, `/academy/module/:id`, `/academy/review`, `/academy/progress`.
- Premium gating lives in one surface: `academy/components/UpgradeSheet.tsx` (copy map in `academy/lib/premium.ts`) opens from the Home banner and every locked lesson affordance, then goes straight to `/payment`. The standalone Victory Premium page is removed — no `/academy/upgrade` route.
- `Layout.tsx`: lesson + subject screens hide the contest top bar; lessons also hide the bottom bar (they have their own action bar).
- `BottomNavigation.tsx`: new "Learn" tab. `TopNavigation.tsx`: academy titles + "Learning settings" (font size, data saver) in the gear menu — the mock's free/premium preview switch is gone, since premium now comes from real payments.
- `components/chat/MarkdownMessage.tsx` now renders through the Academy `Markdown` viewer (KaTeX math, tables, `:::callout`), so AI Practice answers match lessons. Props unchanged.
- New deps: katex, rehype-katex, remark-math.

## Admin (admin-page-clean/)
- Added `src/academy/**` (admin screens + shared parts), `src/services/academy/**`, `src/types/academy.ts`, `components/ui/switch.tsx`.
- Routes mounted at `/dashboard/academy/*` inside `DashboardLayout`; the Academy's own sidebar/top bar were replaced by a slim icon tab strip (Overview, Course builder, AI review, Analytics, Access).
- Sidebar: new "Academy" entry (prefix-matched active state).
- API paths are `/api/academy/...` (this app's axios baseURL carries no `/api`, unlike the student app).
- `index.css`: KaTeX import + Academy block; `tailwind.config.js`: `font-nunito` / `font-nunito-sans` aliases mapped to Poppins/Inter.
- lucide v1 compat: `Youtube` icon replaced with `PlayCircle`.
- New deps: katex, rehype-katex, remark-math, remark-gfm, react-markdown, framer-motion, @radix-ui/react-switch.

## Backend
Untouched, as requested.

## Verified / not verified
- `tsc -b` clean and `vite build` OK for frontend and admin-page-clean.
- NOT verified: the browser walkthrough at 390px (my headless test could not get past the contest's registration gate before the session ended). Please check student Home, lesson tabs (all six on one row), and every admin page, especially Overview, AI review, Analytics, Access and the module editor.
- Run `npm install` in both folders (package.json/lock updated).
