# Admin Panel (`admin-page/`) — audit & issue catalog

Status as of **2026-09-24**: this panel was **inherited** from an earlier iteration of the project and has been **analyzed, not fixed**. This README is the working catalog: how the panel is built, which of its calls actually match the backend we developed in `backend/` (many don't), the security gaps, the mobile/PWA situation the client complained about, and the agreed fix order. It follows the numbering style of `backend/README.md` §9 and `frontend/README.md`. Every finding below was re-verified against the current source on 2026-09-24 (`file:line` references are exact at that date).

The panel **is now in-scoped for this repo**: we own it, will commit fixes to it, and will build the missing admin screens (payment-methods CRUD, AI provider management, Stars toggle, etc. — see §6).

---

## 1. What it is

- Vite 5 + React 18 + TypeScript SPA, `createBrowserRouter` (data mode) in `src/App.tsx`.
- **Mixed UI stacks**: MUI 7 (`@mui/material`, `x-charts`, `x-data-grid`) *and* ~20 Radix/shadcn-style primitives under `src/components/ui/` — inconsistency class B, expect friction when making things responsive.
- Data: `@tanstack/react-query` + `react-table`; HTTP via a shared axios instance `src/services/api.ts` (`withCredentials: true`, `baseURL = VITE_API_URL || http://localhost:8080`).
- Tailwind with a bespoke breakpoint `custom: "970px"` (`tailwind.config.ts:10`) used for the sidebar visibility.
- Editor: tiptap 3 (`src/components/articles/`), PDF utilities (`pdf-lib`, `pdfjs-dist`, `react-pdftotext`).
- Auth: reads the **`token` cookie minted by `POST /api/admin/login`** — same HS256 admin cookie our backend expects; there is **no token in JS** (HttpOnly), so everything rides on `withCredentials`.

### Route map (`src/App.tsx`)

| Route | Page | Notes |
|---|---|---|
| `/login` | `Login` | posts `/api/admin/login` |
| `/register` | `Register` | **cannot work** — see A6 |
| `/dashboard` | `Home` (stats) | children below |
| `…/contest`, `…/contest/:id` | contests | `:id` page re-fetches all students per submission (M10) |
| `…/questions`, `…/addquestion` | questions | add posts to a **nonexistent route** (A2) |
| `…/articles` | article mgmt | |
| `…/users`, `…/user/:id` | students list / profile | profile stats broken (A8–A10) |
| `…/admins` | approve/delete admins | **destructive bugs** (A4, A5); not in sidebar |
| `…/feedback` | feedback-question/response mgmt | all calls 401 (A14) |
| `…/high-scorers` | high-scorer contacts | all calls 401 (A14) |
| `…/payment` | payment review | sends Telegram DMs **from the browser** (A20) |

`Appbar.tsx:283` navigates to `/dashboard/profile`, which is **not a registered route** (dead link).

---

## 2. Gate status (2026-09-24, verified locally)

- `npx tsc --noEmit` → **clean (0 errors)**.
- `npx eslint .` → **122 errors, 14 warnings**. By rule:
  `no-explicit-any` 58 · `no-unused-vars` 48 · `react-refresh/only-export-components` 8 · `react-hooks/exhaustive-deps` 6 · `no-case-declarations` 4 · **`react-hooks/rules-of-hooks` 3** (conditional `useEffect` — a real runtime hazard, not style) · `no-empty-pattern` 3 · `no-empty-object-type` 2 · `prefer-const` 2 · `no-extra-boolean-cast` 1 · `no-prototype-builtins` 1.
- `npm install` → 575 packages, **27 vulnerabilities (2 low, 7 moderate, 17 high, 1 critical)** → full dependency refresh approved by user (same treatment as the frontend got).
- No test runner configured (`package.json` has no test script) — acceptance is gates + manual browser flows.

---

## 3. Admin-panel ↔ backend contract bugs

The backend gained auth gating (#6), route renames and response-shape changes while this panel was out of the repo. Concretely verified:

### 3a. Calls that 404 (routes don't exist)

- **A1 — logout is fake.** `src/services/api.ts:17` POSTs `/api/admin/logout`; the backend has **no logout route** (`admin_handler.go` registers only register/PUT/DELETE/GET/GET-me/GET-/dashboard/login). The HttpOnly `token` cookie lives up to 24 h after "logout" — on a shared machine the session is fully live. Needs a backend cookie-clear endpoint + panel wiring.
- **A2 — question creation dead.** `src/lib/utils.ts:36,65` POST `/api/question/addquestion` — the real routes are `POST /api/question/add` (single, flat JSON) and `POST /api/question/multiple-add` (bulk). The single variant additionally wraps the payload as `{ question }` while the backend binds a flat `questionInput`. Result: **the Add Question page can never save**, single or bulk.
- **A3 — `GET /api/feedback-response/test`** (removed in the backend debug cleanup) still referenced → dead call.

### 3b. Calls that corrupt or silently no-op

- **A4 — admin approval writes orphan rows.** `src/lib/utils.ts:191` sends `PUT /api/admin/{email}` with body `{ data: { isApproved } }`. The backend (`admin_handler.go:101-115`) binds `adminInput` (`id/email/name/is_approved/password`) — the nested wrapper binds **nothing**, then `UpdateAdmin(id=<email>)` PutItems a near-empty admin keyed by *email* instead of updating the real row keyed by *id*. The clicked admin is never approved, and junk rows appear in the table. Approval flow is 100% non-functional.
- **A5 — admin delete no-ops.** `DELETE /api/admin/{email}` while the backend deletes by **id** (`admin_handler.go:118`) → wrong key deleted (or nothing), real admin survives, UI shows success.
- **A6 — Register page can't work.** `registerUser` (`src/lib/utils.ts:181`) posts `/api/admin/register` with `{ data: {...} }` wrapper (backend expects flat `email/password/name` — `admin_handler.go:83-99`) **and** that route is behind `adminAuth` (#6) — an unauthenticated register page can only ever 401. Product decision needed: move admin creation *into* the approved-admins screen (backend already gates it) and drop `/register`.
- **A7 — login contract mismatch + backend gap.** `AuthContext.tsx:50-67` destructures `res.message` expecting an object `{ auth, isApproved }`; the backend returns `{"message": "Login successful, cookie set"}` (a **string**) on 200 and `{"error": ...}` with 401 on failure — so the `auth`/`isApproved` branches are dead code. Worse: `admin_usecase.go:162` `SignIn` **never checks `IsApproved`**, so any registered-but-unapproved admin gets a full working cookie today (backend-side fix required).
- **A11 — live-contest answer editing impossible.** `getContestById` feeds the contest/question editor, but `GET /api/contest/:id` strips answers + explanations while the contest is live (our security fix #11/#12). Admins editing questions of a running contest see blanks and can save them back as blanks. The panel should edit questions via `GET /api/question/` (admin-gated, complete) instead.
- **A12 — announce upload silently dropped.** `contestServices.ts:84` builds multipart for `POST /api/contest/announce/:id`, but the domain `Announce` field is a plain string — any attached file is discarded server-side.
- **A13 — question PATCH can corrupt image URLs.** `updateQuestion` JSON branch (`src/lib/utils.ts:126-145`) posts `question_image`/`explanation_image` as-is; if the form holds a `File` (user swapped the image but the no-File branch still ran), the server binds the value and persists the **filename string** into the Cloudinary URL field.
- **A19 — notification creation dead.** `NotificationContext.tsx:94` POSTs `/api/notification` (no trailing slash → gin 301 redirect loses the POST on some clients) with `{ message, type }` and **no `recipient_id`** — backend `AddNotification` binds it and stores a notification nobody receives.
- **A18 — "Notify user" is a stub.** `src/components/profile/Profile.tsx:89-91` `handleNotifyUser` only `console.log`s.

### 3c. Auth-context / config bugs

- **A14 — feedback & high-scorers screens are 401 by design-now-broken.** `FeedbackManagement.tsx:123+` and `HighScorersContactList.tsx:59` use **bare `axios`** (no `withCredentials`) against `API_BASE_URL = VITE_API_URL || "https://txnfqqn7-8081.euw.devtunnels.ms"` — since backend #6 every one of those routes needs the admin cookie, so **all reads/writes fail**, and the stale dev-tunnel fallback isn't even in our CORS allowlist.
- **A15 — `admin_id: "admin_user_id"` hardcoded** (`FeedbackManagement.tsx:196,278`) — backend keys by the real admin identity.
- **A8 — student profile stats never render.** `profile/ProfileHeader.tsx:76` and `profile/StatsCards.tsx:15-42` read `user.stat.*`, but `GET /api/student/profile-admin/:id` returns `StudentProfileAdminResponse` = embedded `Student` + `payment` + `contestSubmissions` + `totalPoints` — **there is no `stat` field** (`domain/student.go:62`). The per-student stat lives on the separate `GET /api/student/quickstat/:id` route (`{"stat": ...}`) this panel never calls → blank/crash on the profile card.
- **A9 — student update PUTs to `/api/student/undefined`.** `studentServices.ts:12` uses `student.student_id`; the field is `id`/`telegram_id`.
- **A10 — gender rendered as `sex`.** users table reads `student.sex`; backend JSON key is `gender` (`domain/student.go:18`).
- **A20 — live bot token used from the browser.** `profile/PaymentManagement.tsx:149-172` reads `import.meta.env.VITE_BOT` and calls `api.telegram.org/bot<token>/sendMessage` **directly from the client** — same class as frontend S1: token ships in the bundle/network tab. Must become a backend call. (The current `admin-page/.env` indeed holds a live token — it is gitignored and **must never be committed**; the leaked one still awaits @BotFather revocation.)
- **A21 — no 401 interceptor anywhere.** When the cookie expires (24 h), every screen silently shows fetch-failure states; nothing redirects to `/login`.
- **A22 — conditional hooks.** 3 `react-hooks/rules-of-hooks` errors (e.g. `useEffect` after an early return) — real crash potential independent of the API bugs.
- **A23 — cookie vs dev origins.** Backend cookie is `Secure; SameSite=None` — works on `http://localhost`, breaks if you open the panel by LAN IP (real-device testing!) and requires our CORS allowlist to include the panel origin. Also note the local backend runs on `:8081` in this repo's dev setup while the panel defaults to `:8080` — set `VITE_API_URL` explicitly.

---

## 4. Architecture / hygiene

- Mixed MUI + shadcn/Radix + recharts + MUI-charts: four styling mentalities in one app (dashboard uses MUI `Grid`+`Chart`, pages use Tailwind cards, tables use react-table primitives, `home/ChartUserByCountry.tsx` uses recharts + MUI `PieChart` mixed).
- `src/lib/utils.ts` is a grab-bag of API helpers *and* React helpers (violates the react-refresh lint rule).
- Heavy `console.log` debugging left in `updateQuestion` (`src/lib/utils.ts:79-138`).
- Dead code: `common/MenuButton.tsx` is exported but used nowhere (the mobile nav it was meant for was never built).
- Support docs in this folder are **stale marketing-style leftovers**: `backend-endpoints.md` (~18 enumerated mismatches vs the current router — it predates #6 auth gating, the `/question/add` naming, `/payment-admin/settings`, `/ai-admin`, `/banks`, quickstat/rankings…), plus `BACKEND_SETUP.md`, `CONTEST_STATISTICS_README.md`, `DASHBOARD_ENHANCEMENTS.md`, `DASHBOARD_INTEGRATION_SUMMARY.md`. Treat `backend/README.md` §5 as the only endpoint truth; consider deleting these during the fix pass.

---

## 5. Mobile & responsiveness (client: "it won't work on mobile")

Root cause first:

- **M1 — no `<meta name="viewport">` at all** in `index.html` → phones render the desktop layout at ~980px logical width and shrink it; *every* media query therefore evaluates as "desktop". This single missing line explains most of the client's complaint.
- **M2 — duplicate `<title>` tags** (`index.html:18` "React App", `:24` "Vite + React + TS").
- **M3 — no mobile navigation.** Sidebar is `hidden custom:block` (visible only ≥970px) with **zero fallback** — under 970px there is literally no way to move between pages. `vaul` (Drawer) is already installed and unused; `MenuButton` dead (see §4).
- **M4 — sidebar layout bugs even on desktop:** `w-64` sidebar inside a `w-60` `overflow-hidden` parent clips ~16px; the collapse FAB toggles nothing.
- **M5 — dead profile link in Appbar** (`/dashboard/profile` unregistered, §1) and `/admins` missing from the sidebar nav.
- **M6 — sub-44px touch targets and 14px inputs** across toolbars/tables → iOS auto-zooms on focus.
- **M7 — dashboard `gridData` sets `minWidth` summing to 830px** → forced horizontal scroll on phones.
- **M8 — `data-table.tsx` mounts every row** (only `getCoreRowModel`, no pagination/virtualization) — the students list (hundreds of rows) is unusably janky on a phone.
- **M9 — fixed-size charts:** `ChartUserByCountry.tsx` PieChart `width/height=260` non-responsive; `.chart-container` CSS class is dead.
- **M10 — structural markup bug:** `payment/Payment.tsx:26-33` nests `TabsList` inside `TabsList` — the tab bar renders broken on any narrow viewport.
- **M11 — `Menubar` (desktop hover menu) used as the per-row mobile menu; hover-only affordances** (e.g. `articles/admin/ImagesDrawer.tsx:95`) that are unreachable by touch.
- **M12 — perf on mobile:** the contest-detail page calls `getAllStudents()` once **per submission** (N+1).

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
| Student quickstat/rankings | 🔒 `/api/student/quickstat/:id`, rankings | wire into the profile screen (fixes A8 from the correct side) |
| Articles | status filter on `GET /api/articles` | status chips + filter |

---

## 7. PWA / installable-app status

- **None today**: no `manifest`, no service worker, no `vite-plugin-pwa`; `public/` contains only `vite.svg`.
- Agreed approach (from the client's "make it a PWA" ask):
  1. viewport + `theme-color` (`#00AB55`) + iOS apple tags (prereq for everything — see M1);
  2. `manifest.webmanifest` with `start_url: "/dashboard"` (root renders Login), icons at 192/512/maskable — to be generated from repo-root `logo.png` alongside the favicon task;
  3. `vite-plugin-pwa` `generateSW`, **shell-only precache** — deliberately **no offline caching of API data**: an admin acting on stale approval/payment state is how you double-approve payments;
  4. iOS standalone caveats documented (no push, cookie under ITP).
- Fix-order agreed with user: **M1 viewport → M3 mobile nav (vaul already installed) → M6 input/button sizes → M8 tables → M9/M10 charts & nested tabs → PWA shell (§7) → §6 missing pages → §3 API bugs** (some §3 fixes must ride along with their page builds; A4/A5/A7 are security-adjacent and go first among them).

---

## 8. Repo rules for this folder

- `admin-page/.env` contains **live credentials** (bot token, admin JWT) — gitignored, never commit, never echo into docs/logs. `node_modules` ignored. `.env.example` (placeholders only) is the tracked template.
- Gates to keep honest on every change: `npx tsc --noEmit`, `npx eslint .`, `npm run build`. The eslint backlog (122 errors) is burned down as part of the fix pass, not waived.
