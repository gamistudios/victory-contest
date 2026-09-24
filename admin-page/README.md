# Admin Panel (`admin-page/`) — audit & issue catalog

Status as of **2026-09-24** (evening): analyzed **and wave 1 fixed**. The dependency refresh (`ab7cdad`), the five contract/security slices A–E (`1201c45`, `b78277a`, `31a6d16`, `240f944`, `ebd786d`) and the dead-code/type cleanup (`9d9c609`) landed — fixed items below carry their commit. What remains: the mobile/nav work (M3–M12), the §6 missing screens, and the open §3 items (A6 product decision, A12, A21, A22, A23). This README stays the working catalog and follows the numbering style of `backend/README.md` §9 and `frontend/README.md`. Remaining `file:line` references were re-verified against current source.

The panel **is now in-scoped for this repo**: we own it, will commit fixes to it, and will build the missing admin screens (payment-methods CRUD, AI provider management, Stars toggle, etc. — see §6).

---

## 1. What it is

- Vite 7 (refreshed from 5.4 in `ab7cdad`) + React 18 + TypeScript 5.9 SPA, `createBrowserRouter` (data mode) in `src/App.tsx`.
- **Mixed UI stacks**: MUI 9 (`@mui/material`, `x-charts`, `x-data-grid`) *and* ~20 Radix/shadcn-style primitives under `src/components/ui/` — inconsistency class B, expect friction when making things responsive.
- Data: `@tanstack/react-query` + `react-table` (**pinned to v8** — the v9 API break is deferred to the responsive-tables slice); HTTP via a shared axios instance `src/services/api.ts` (`withCredentials: true`, `baseURL = VITE_API_URL || http://localhost:8080`).
- Tailwind with a bespoke breakpoint `custom: "970px"` (`tailwind.config.ts:10`) used for the sidebar visibility.
- Editor: tiptap 3 (`src/components/articles/`), PDF utilities (`pdf-lib`, `pdfjs-dist`, `react-pdftotext`).
- Auth: reads the **`token` cookie minted by `POST /api/admin/login`** — same HS256 admin cookie our backend expects; there is **no token in JS** (HttpOnly), so everything rides on `withCredentials`.

### Route map (`src/App.tsx`)

| Route | Page | Notes |
|---|---|---|
| `/` | `Login` | posts `/api/admin/login`; distinguishes 401 vs 403 (`1201c45`) |
| `/register` | `Register` | **cannot work** — see A6 |
| `/dashboard` | `Home` (stats) | children below |
| `…/contest`, `…/contest/:id` | contests | `:id` page re-fetches all students per submission (M10) |
| `…/questions`, `…/addquestion` | questions | add/edit contract fixed (`b78277a`) |
| `…/articles` | article mgmt | |
| `…/users`, `…/user/:id` | students list / profile | profile stats fixed (`31a6d16`, `9d9c609`) |
| `…/admins` | approve/delete admins | id-keyed since `1201c45`; now in the sidebar (`ebd786d`) |
| `…/feedback` | feedback-question/response mgmt | cookie auth restored (`240f944`) |
| `…/high-scorers` | high-scorer contacts | cookie auth restored (`240f944`) |
| `…/payment` | payment review | browser-side Telegram DMs removed (`31a6d16`) |

`Appbar.tsx` used to navigate to `/dashboard/profile`, an unregistered route — now points at `/dashboard/admins` (`ebd786d`).

---

## 2. Gate status (2026-09-24, verified locally after wave 1)

- `npx tsc --noEmit` → **clean (0 errors)**.
- `npx eslint .` → **95 errors, 13 warnings** (was 122/14 before the fix wave). Errors by rule:
  `no-unused-vars` 46 · `no-explicit-any` 38 · **`react-hooks/rules-of-hooks` 3** (still open — A22) · `no-empty-pattern` 3 · `prefer-const` 2 · `no-case-declarations` 1 · `no-empty-object-type` 1 · `no-prototype-builtins` 1. Warnings: `react-refresh/only-export-components` 8 · `react-hooks/exhaustive-deps` 5. Backlog lives mostly in articles/dashboard code untouched by wave 1.
- `npm audit` → **0 vulnerabilities** after the full refresh (`ab7cdad`, 27 → 0). Framework choices curated: React 18 kept (frontend precedent), Vite ≥7 (no patched 5.x/6.x for the high advisory), react-table pinned v8.
- `npm run build` → clean (≈1m30s). No test runner configured (`package.json` has no test script) — acceptance is gates + manual browser flows.

---

## 3. Admin-panel ↔ backend contract bugs

The backend gained auth gating (#6), route renames and response-shape changes while this panel was out of the repo. Concretely verified:

### 3a. Calls that 404 (routes don't exist)

- **A1 — ✅ fixed (`1201c45`).** The backend gained a public `POST /api/admin/logout` that clears the HttpOnly `token` cookie (MaxAge −1), and `AuthContext.logout` calls it before resetting state — no more live 24 h session after "logout".
- **A2 — ✅ fixed (`b78277a`).** `src/services/questionServices.ts` now speaks the real contract: `addQuestion` → multipart `POST /api/question/add` (flat fields, 1-based `answer`), `addMultipleQuestions` → JSON `POST /api/question/multiple-add` `{questions}`. The dead `/addquestion` calls (and their `src/lib/utils.ts` twins) are gone (`9d9c609`).
- **A3 — ✅ fixed (`240f944`).** `testConnection` against the removed `/api/feedback-response/test` deleted.

### 3b. Calls that corrupt or silently no-op

- **A4 — ✅ fixed (`1201c45`).** Backend `PUT /api/admin/:id` is now a read-modify-write (`AdminUpdate{Name,IsApproved,Password *string}` pointer semantics — nil means unchanged, email immutable, unknown id → 404) and the panel sends a flat `{is_approved}` keyed by `admin.id`. Approval actually works; no more junk rows keyed by email.
- **A5 — ✅ fixed (`1201c45`).** `deleteAdmin(id)` + backend existence check (`ErrAdminNotFound` → 404); no silent no-op.
- **A6 — 🟡 partial (`1201c45`).** `registerUser` now posts a flat body and the backend ignores `is_approved` on register (no self-approval). But `/register` remains a dead funnel — the route sits behind `adminAuth`, so unauthenticated visitors can only 401. Product decision pending: move admin creation into the approved-admins screen and drop `/register`.
- **A7 — ✅ fixed (`1201c45`).** `SignIn` rejects valid-but-unapproved creds with `ErrNotApproved` → 403 `{"error":"account not approved"}` and no cookie. `AuthContext` parses the real response shapes (401 → "Wrong email or password", 403 → approval-pending message). ⚠️ Ops note: any prod admin with `is_approved=false` is locked out after deploy (client communication item).
- **A11 — ✅ fixed (`b78277a`).** `ContestById`'s Problems tab re-hydrates full rows (answers + explanations) from the admin-gated `GET /api/question/`, preserving contest order — the editor no longer sees blanks on a live contest.
- **A12 — open.** Multipart announce uploads are still discarded server-side (`Announce` is a plain string).
- **A13 — ✅ fixed (`b78277a`).** `updateQuestion` is presence-aware: multipart when the form holds a `File`, and the JSON branch refuses File values with a clear error — a filename string can no longer be persisted into the Cloudinary URL fields.
- **A19 — ✅ fixed (`240f944`).** POSTs `/api/notification/` (trailing slash) with the full `domain.Notification` body including `recipient_id`. The bell's admin inbox key `recipient_id: "admin"` is correct — the backend special-cases it (`notification_usecase.go`).
- **A18 — ✅ fixed (`31a6d16`).** Profile "Notify user" and Payment "send final notice" create real backend notifications (`sendStudentNotification`). Note: `AddNotification` only persists the row — a "final notice as Telegram DM" additionally needs a server-side notification→Telegram pump (backend follow-up, recorded in the backend README).

### 3c. Auth-context / config bugs

- **A14 — ✅ fixed (`240f944`).** Both screens use the shared `api` instance (`withCredentials`, `VITE_API_URL`); the stale dev-tunnel fallback is gone; failures surface in an error banner via `describeApiError` (401 → "session missing or expired, log in again").
- **A15 — ✅ fixed (`240f944`).** The admin identity comes from `GET /api/admin/me`.
- **A8 — ✅ fixed (`31a6d16`, `9d9c609`).** Profile fetches quickstat (aggregated into the stat cards client-side) and detail stats (`GET /api/submission/statistics/:id` for the subject/grade/trend charts) in parallel with graceful degradation. `GET /api/student/profile-admin/:id` still has no `stat` field — fine, the phantom `User.stat` is removed from the types.
- **A9 — ✅ fixed (`31a6d16`).** `PUT /api/student/:id` with the right row key and a flat patch body. ⚠️ Backend limitation: the repository skips zero values, so fields cannot be *unset* via this route (e.g. unsuspending a student).
- **A10 — ✅ fixed (`31a6d16`, `9d9c609`).** `gender` throughout; `types/models.ts` `Student.gender` now matches the backend JSON key.
- **A20 — ✅ fixed (`31a6d16`).** `VITE_BOT` / `api.telegram.org` are gone from panel code; the "final notice" button creates a backend notification instead. Housekeeping pending: delete the stale key from local `admin-page/.env` and revoke the leaked token via @BotFather.
- **A21 — open.** No global 401 interceptor; expired cookies still show per-screen failure states instead of redirecting to login.
- **A22 — open.** The 3 `react-hooks/rules-of-hooks` errors (conditional `useEffect` after early returns) remain — real crash potential, not style.
- **A23 — open.** Cookie is `Secure; SameSite=None` — works on `localhost`, breaks via LAN IP (real-device testing!) and needs the panel origin in the backend CORS allowlist; local dev must set `VITE_API_URL` (backend runs on `:8081` here, panel defaults to `:8080`).

---

## 4. Architecture / hygiene

- Mixed MUI + shadcn/Radix + recharts + MUI-charts: four styling mentalities in one app (dashboard uses MUI `Grid`+`Chart`, pages use Tailwind cards, tables use react-table primitives, `home/ChartUserByCountry.tsx` uses recharts + MUI `PieChart` mixed).
- `src/lib/utils.ts` is still a grab-bag of API helpers *and* React helpers (violates the react-refresh lint rule) — but the dead question API helpers + their `console.log` spam are gone (`9d9c609`); question traffic lives solely in `services/questionServices.ts`.
- Dead code: `common/MenuButton.tsx` is exported but used nowhere (the mobile nav it was meant for was never built). `lib/studentFilter.tsx` (zero importers) deleted in `9d9c609`.
- Support docs in this folder are **stale marketing-style leftovers**: `backend-endpoints.md` (~18 enumerated mismatches vs the current router — it predates #6 auth gating, the `/question/add` naming, `/payment-admin/settings`, `/ai-admin`, `/banks`, quickstat/rankings…), plus `BACKEND_SETUP.md`, `CONTEST_STATISTICS_README.md`, `DASHBOARD_ENHANCEMENTS.md`, `DASHBOARD_INTEGRATION_SUMMARY.md`. Treat `backend/README.md` §5 as the only endpoint truth; consider deleting these during the fix pass.

---

## 5. Mobile & responsiveness (client: "it won't work on mobile")

Root cause first:

- **M1 — ✅ fixed (`ebd786d`).** `index.html` now has `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">` — the single line behind most of the client's complaint.
- **M2 — ✅ fixed (`ebd786d`).** Single `<title>Victor Contest Admin</title>`.
- **M3 — no mobile navigation (open).** Sidebar is `hidden custom:block` (visible only ≥970px) with **zero fallback** — under 970px there is literally no way to move between pages. `vaul` (Drawer) is already installed and unused; `MenuButton` dead (see §4).
- **M4 — sidebar layout bugs even on desktop:** `w-64` sidebar inside a `w-60` `overflow-hidden` parent clips ~16px; the collapse FAB toggles nothing.
- **M5 — ✅ fixed (`ebd786d`).** Appbar profile link now goes to `/dashboard/admins`, and "Admins" is a sidebar entry.
- **M6 — sub-44px touch targets and 14px inputs** across toolbars/tables → iOS auto-zooms on focus.
- **M7 — dashboard `gridData` sets `minWidth` summing to 830px** → forced horizontal scroll on phones.
- **M8 — `data-table.tsx` mounts every row** (only `getCoreRowModel`, no pagination/virtualization) — the students list (hundreds of rows) is unusably janky on a phone.
- **M9 — fixed-size charts:** `ChartUserByCountry.tsx` PieChart `width/height=260` non-responsive; `.chart-container` CSS class is dead.
- **M10 — structural markup bug:** `payment/Payment.tsx:26-33` nests `TabsList` inside `TabsList` — the tab bar renders broken on any narrow viewport.
- **M11 — `Menubar` (desktop hover menu) used as the per-row mobile menu; hover-only affordances** (e.g. `articles/admin/ImagesDrawer.tsx:95`) that are unreachable by touch.
- **M12 — perf on mobile:** the contest-detail page calls `getAllStudents()` once **per submission** (N+1).

Concrete 390px-width offenders found during wave 1 (start here for the mobile slice): `home/CustomizedDataGrid.tsx` + `home/gridData.tsx:88-125` (~780px `minWidth` columns), `layout/DashboardLayout.tsx:36` `w-screen` + `:51` `px-6`, `home/ChartUserByCountry.tsx:151` `width=260`, `contests/DatePicker.tsx:62` `w-[280px]`, `auth/Register.tsx:144` fixed-width dropzone.

---

## 6. Admin UI missing for backend routes that already exist

Everything below has a working, gated backend API but **no screen in this panel** (today it's curl-only). This is the "implement the missing pages" backlog:

| Backend surface | Route(s) | Screen to build |
|---|---|---|
| **Payment methods** (banks/Telebirr/M-Pesa — the student Payment page now renders these live) | `GET /api/banks`, 🔒 `GET /banks/all`, `GET/POST/PUT/DELETE /banks/:id` | CRUD + enable/disable + display order |
| **Telegram Stars toggle** | 🔒 `GET/PUT /api/payment-admin/settings` (`allow_stars`, `stars_amount`) | switch + amount field (frontend/backend READMEs currently note "no Stars screen yet" — update both when this lands) |
| **AI providers** | 🔒 `/api/ai-admin/providers` CRUD + `/:id/test` + `POST/DELETE /:id/default` + `GET/PUT /settings` | provider list (base_url/api_key/models, last-4 key hint), test-connection button, default pin, premium-required switch |
| Payment review | 🔒 `DELETE /api/payment/:id`, `GET /payment/withstatus`, expired list | delete button + status filter on the existing payments screen |
| Questions | 🔒 `POST /api/question/multiple-delete` | bulk-select + bulk-delete on the questions table |
| Comments | 🔒 `PUT /api/articles/:id/comments/:commentId`, `DELETE …/comments/:commentId` | moderation list |
| Notifications | 🔒 `POST /api/notification/`, broadcast | broadcast composer (also fixes A19 by using the right shape) |
| Submissions | 🔒 list + `DELETE /api/submission/:id` | submissions browser for a contest |
| Page views | 🔒 `/api/pageview` | analytics panel |
| Contest registrations | 🔒 `/api/contest-registration` | registrations/approvals screen |
| Achievements | 🔒 `/api/achievement` | achievements management |
| Student quickstat/rankings | 🔒 `/api/student/quickstat/:id`, rankings | ✅ wired into the profile screen (`31a6d16`, detail-stats charts `9d9c609`) — rankings display still open |
| Articles | status filter on `GET /api/articles` | status chips + filter |

---

## 7. PWA / installable-app status

- **None today**: no `manifest`, no service worker, no `vite-plugin-pwa`; `public/` holds the new `favicon.ico` (`ef62376`) and nothing else.
- Agreed approach (from the client's "make it a PWA" ask):
  1. viewport ✅ (`ebd786d`) — still to do: `theme-color` (`#00AB55`) + iOS apple tags;
  2. `manifest.webmanifest` with `start_url: "/dashboard"` (root renders Login), icons at 192/512/maskable — to be generated from repo-root `logo.png` (favicon already done, `ef62376`);
  3. `vite-plugin-pwa` `generateSW`, **shell-only precache** — deliberately **no offline caching of API data**: an admin acting on stale approval/payment state is how you double-approve payments;
  4. iOS standalone caveats documented (no push, cookie under ITP).
- Fix-order progress: **M1 viewport ✅ → M3 mobile nav (vaul already installed) → M6 input/button sizes → M8 tables → M9/M10 charts & nested tabs → PWA shell (§7) → §6 missing pages → remaining §3 items** (A6 product decision, A12, A21–A23).

---

## 8. Repo rules for this folder

- `admin-page/.env` contains **live credentials** (bot token, admin JWT) — gitignored, never commit, never echo into docs/logs. The bot-token *code path* is gone (`31a6d16`) but the stale key still sits in the local file — remove it and revoke via @BotFather. `node_modules` ignored. `.env.example` (placeholders only) is the tracked template.
- Gates to keep honest on every change: `npx tsc --noEmit`, `npx eslint .`, `npm run build`. The eslint backlog (95 errors after wave 1) is burned down as part of the fix pass, not waived.
