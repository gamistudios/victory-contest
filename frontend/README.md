# Victory Contest — Frontend (React + TypeScript)

The Telegram Mini App client for Victory Contest ("Ayahuna / Victory Contest") — a timed quiz/coding-contest platform for Ethiopian students. Runs inside Telegram (`window.Telegram.WebApp`), identifies users by `initDataUnsafe.user.id`, and talks to the Go backend in `../backend` via axios. Deploys to Vercel.

> **Status (2026-09-23):** the issue catalog in §9 has been worked through — all security-correctness fixes that could be done client-side are merged, B20 (hardcoded values) is closed, ESLint reports **0 errors / 0 warnings** and `tsc -b && vite build` is green. Dev builds run in a plain browser by default via `devTelegramMock` (no Telegram required; opt out with `VITE_MOCK_TELEGRAM=false`). Remaining items need product/backend decisions (S2, S3, S4, B6) and are listed open in §9/§10.

## Contents

1. [Tech stack](#1-tech-stack)
2. [Structure & routing](#2-structure--routing)
3. [State management & auth](#3-state-management--auth)
4. [API layer](#4-api-layer)
5. [Pages](#5-pages)
6. [Key hooks & mechanics](#6-key-hooks--mechanics)
7. [Types & data models](#7-types--data-models)
8. [Running](#8-running)
9. [Issue catalog — status](#9-issue-catalog--status)
10. [Remaining recommendations](#10-remaining-recommendations)

---

## 1. Tech stack

From `package.json`:

- **Core:** React 18.3.1, TypeScript ~5.5.3, Vite 5.4.2 (`@vitejs/plugin-react`, `vite-plugin-svgr` for `*.svg?react`).
- **Routing:** `react-router-dom` ^7.0.2.
- **Data:** plain **axios** ^1.7.9 — *no* react-query/SWR; every page hand-rolls `useState` + `useEffect` + axios (with AbortController race guards).
- **Forms:** `react-hook-form` ^7.54.2 + `zod` ^4.1.13 + `@hookform/resolvers` (typed via `useForm<z.input<S>, unknown, z.output<S>>` — no `as any` resolvers).
- **UI:** shadcn/ui ("new-york", `components.json`) over Radix primitives, Tailwind 3.4 + `tailwind-merge` + CVA, `lucide-react`, `framer-motion` ^12, `recharts` ^3.2, `sonner` ^2 (toasts), `vaul` (drawer), `date-fns` ^4.
- **Sanitization:** `dompurify` ^3.4 — all article HTML goes through it before `dangerouslySetInnerHTML`.
- **SDKs via `<script>` in `index.html`:** `telegram-web-app.js` and Adsgram `sad.min.js` (typed in `src/types/adsgram.d.ts`) — not npm deps.
- **Quality gates:** `npm run build` = `tsc -b && vite build`; `npm run lint` = `eslint .` (flat config, currently clean). **No tests, no CI, no `.env.example` yet.**
- Oddities left: `@types/react-router-dom` and `caniuse-lite` sit in `dependencies`; `next-themes` and `@radix-ui/react-collapsible` were dropped with the dead components that needed them.

## 2. Structure & routing

```
src/
├── main.tsx          StrictMode + createRoot(<App/>) — no providers here
├── App.tsx           gates tree on useTelegram().isLoading; wraps in the single AuthProvider; all routes under Layout
├── pages/            13 route components (see §5)
├── components/       feature components + article/ + payment-history/ + ui/ (shadcn)
├── context/          AuthContext.tsx, NotificationContext.tsx
├── hooks/            useTelegram (memoized), useAdsgram, useContestTimer, useScreenshotProtection
├── services/         api.ts (axios instance) + per-feature service modules + telegramServices.ts (backend proxies)
├── types/            index.ts, article.ts, adsgram.d.ts, svg.d.ts
├── lib/              utils.ts (cn), data.ts (static badge catalog)
└── assets/           SVG illustrations/icons only
```

Routes (all in `App.tsx`, flat under one `Layout`; **no lazy loading**; a catch-all `path="*"` renders `NotFound`):

| Path | Page |
|---|---|
| `/` | Home |
| `/contest/:id` | Contest |
| `/leaderboard` | Leaderboard |
| `/statistics` | Statistics |
| `/profile` | Profile |
| `/registration` | ContestStudentRegistration |
| `/contest-editorial` | ContestEditorial |
| `/feedback` | FeedBack |
| `/ai-practice` | AIPractice (currently renders Coming Soon) |
| `/register` | StudentRegisteration |
| `/payment` | Payment |
| `/payment-history` | UserPaymentHistoryPage |
| `/article`, `/article/:id` | Articles → ArticleView |
| `*` | NotFound |

`Layout.tsx` wraps children in TopNavigation (optional) + fixed BottomNavigation (hidden on `/register`) and mounts `NotificationProvider` — the duplicate `AuthProvider` is gone (one auth tree now). Theme: purple Telegram header `#8b5cf6`, three Google fonts, global `user-select:none`.

## 3. State management & auth

**`AuthContext.tsx`** — the only session concept:
- Reads `initDataUnsafe.user` via `useTelegram` → `getStudentById(user.id)`. Found → logged in.
- Guard by `location.pathname` string compare: renders Loader / `ErrorState` / `<Navigate to="/register">` for unregistered users, and navigates registered users away from `/register`. Error messages narrow `unknown` → `Error` properly.
- **No Telegram `initData` HMAC validation, no tokens, no refresh, no logout.** Relies on `withCredentials:true` cookies (`services/api.ts`). ⚠️ open as **S2**.

**`NotificationContext.tsx`** — one-shot fetch keyed on `user?.id`; `read_notifications` access is guarded against undefined entries; notifications service (incl. `deleteNotification`) is now actually wired into `NotificationCenter`. No polling/websocket.

**Elsewhere:** per-page `useEffect` fetches with correct dep arrays and AbortController/ignore-flag race guards; Telegram **CloudStorage** (with `telegram_cloud_*` localStorage fallback, `hooks/useTelegram.ts`) is a second persistence layer for article bookmarks/read state and a feedback flag.

## 4. API layer

`src/services/api.ts`: `baseURL = import.meta.env.VITE_API_BASE_URL + "/api"`, `withCredentials: true`, default JSON headers. **No interceptors at all.** The old hardcoded-`telegramApi` instance (live bot token in client code) is **deleted**.

`src/services/telegramServices.ts` — new module; all Bot API calls now go through backend proxies:
- `POST /api/telegram/invoice-link` → `createInvoiceLink`
- `POST /api/telegram/prepared-inline-message` → `savePreparedInlineMessage`

⚠️ Requires the backend (see `../backend` commit adding these handlers) to be deployed before the Stars payment path works in production.

Endpoints per service:

| Service | Endpoints |
|---|---|
| `studentServices.ts` | GET/PUT `/student/:id` · POST `/student/` · GET `/submission/statistics-profile/:id` |
| `contestApi.ts` | GET `/contest/status/active` · GET `/contest/:id` · GET `/submission/rank/:id` · GET/POST `/contest-registration/[check/:sid/:cid]` · POST `/submission/` · GET `/submission/editorial/:sid?contest_id=` · GET `/contest-registration/contest/:id` (response key `registerations` mirrors backend typo) |
| `aiService.ts` | POST `/ai/getRecommendation` · POST `/ai/practice` |
| `articleService.ts` | GET `/articles/published?number=` · GET `/articles/:id` · GET/POST `/articles/:id/comments` · PUT `/articles/:id` · PATCH `/articles/:id/stats` (Bot API calls moved out to `telegramServices.ts`) |
| `notificationService.ts` | GET `/notification/recipient/:id` · PATCH/DELETE `/notification/:id` — used by `NotificationCenter`/`NotificationContext` |
| `paymentServices.ts` | POST `/payment/` (multipart; locally disables `withCredentials`) · GET `/payment/:userId` |
| `telegramServices.ts` | POST `/telegram/invoice-link` · POST `/telegram/prepared-inline-message` |
| `bankServices.ts` | GET `/banks/` (active list for the Payment page) · GET `/banks/all` · POST/PUT/DELETE for admin use — banks are now **server-configured**, hardcoded lists removed |

## 5. Pages

1. **Home** — active-contest card, contest cards filtered `con.grade === userInfo?.grade` (grade format now consistent end-to-end), countdown, welcome carousel, editorial links. Three bugs fixed 2026-09-23: the contest list fetched a nonexistent `/contest/status/active` (404 → "Something Went wrong" error card; now `GET /contest/`, Home already splits active/previous by `end_time`); `ArticleListForHome`/`Leaderboard` never re-armed their `isMountedRef` on remount, so StrictMode's dev double-mount silently discarded every fetch result (articles rendered empty despite the API returning data); and the Previous Contests section had no empty state (blank when none) — now shows `NoContests type="past"`.
2. **Contest** — the exam screen: question dots + dropdown nav, timer, submit; **score still computed client-side** and `time_taken: 60` still hardcoded (⚠️ S3, needs server-side scoring decision); the dead error-state block was removed.
3. **Leaderboard** — podium, list, "you" panel; divide-by-zero percentages guarded; retry refetches instead of `location.reload()`.
4. **Statistics** — recharts line/area/radar, stat cards; the fabricated trend deltas "+12%/+5%/−3s/+28" were removed (B20 ✅); premium-gated AI recommendation panel; the 75-line commented mock block is deleted.
5. **Profile** — edit student form (grade/school/phone/timezone), badge grid from static `lib/data.ts` (fake `earnedDate`s removed; date row renders only for a real date — B20 ✅), PUT `/student/:id`.
6. **ContestStudentRegistration** — contest info + register; the form's grade/subjects/experience are now actually sent; participants rendered as a real count (was an array assigned to a `number` field); guarded against missing `contestInfo.id`.
7. **ContestEditorial** — post-contest review via `?contest_id`; answer index convention conflict remains (⚠️ B6).
8. **AIPractice** — full practice UI (timer, settings) still **unreachable**: `return <ComingSoon/>` (product decision pending).
9. **Articles** — wrapper over `ArticleList` + `ArticleFilters`; `ArticleView` renders article HTML **sanitized with DOMPurify**; view/like/bookmark flows use array-shaped CloudStorage keys with stable callbacks.
10. **StudentRegisteration** *(sic)* — RHF+zod signup (photo URL, name, phone, grade "1".."13"; city/region now default empty and region is validation-required — B20 ✅), then client-side `navigate("/")` instead of a full-page reload.
11. **Payment** — bank-transfer screenshot upload (10MB validated client-side); the bank dropdown **and** the "Bank Transfer Details" drawer are fetched live from `/api/banks` (admin-managed; loading/error+retry states, "Other" free-text entry kept); the `"112pay"` debug user-id fallback is gone — submitting without `user.id` is blocked with a toast. Telegram Stars `openInvoice` path still submits `status:"Approved"` from the client (⚠️ S4).
12. **UserPaymentHistoryPage** — timeline via `PaymentTimelineItem` (orphan `payment-timeline.tsx` deleted).
13. **FeedBack** — multi-section survey persisted to CloudStorage + `updateUserInfo`; the ~140-line `if (false && …)` block is deleted; confirmations use Telegram `showConfirm` (with `window.confirm` only as non-Telegram fallback); the comment textarea now enforces `maxLength={500}` matching its "/500" counter (B20 ✅).

## 6. Key hooks & mechanics

- **`useTelegram.ts`** — reads `window.Telegram.WebApp` once; sets header/background; ~25 wrappers (haptics, CloudStorage+fallback, MainButton/BackButton, `openInvoice`, `shareMessage`). **All callbacks are memoized**; `getCloudData<T>` is generic so callers get typed payloads without `any`.
- **`useAdsgram.ts`** — SDK init with `debug: import.meta.env.DEV` (no more debug in prod). **No content is ad-gated**: `<AdTrigger>` is still commented out in `Layout.tsx:40` (product decision pending).
- **`useContestTimer.ts`** — 1s tick → UPCOMING/ACTIVE/ENDED; misses exact `=== startTime` boundary; clears interval on ENDED.
- **Anti-cheat** — `useScreenshotProtection.tsx` + `ScreenProtection.tsx`: still **dead** (only consumer import commented at `App.tsx:20`); keep-or-delete is an open decision.
- **`NotificationCenter.tsx`** — drawer from TopNavigation; uses `notificationService` for real delete; `markAllAsRead` no longer clobbers the `read_notifications` map; no in-place mutation.
- **`PaymentAlert.tsx`** — expiry banner checks **all** payments (the early `break` bug fixed); no non-null assertions.
- **`LeaderboardModal.tsx`** — fetch keyed on `selectedContest.id`; URLs properly `encodeURIComponent`-ed.
- **`BottomNavigation.tsx`** — real accessible navigation controls with keyboard support.

## 7. Types & data models

`src/types/index.ts`: `TelegramWebApp`/`TelegramUser`, `Question`, `ContestAnswer`, `ContestSubmission`, `Student`/`AuthUser`, `Contest`, `LeaderboardEntry`, `UserStats` (snake_case: `total_contests`, `average_accuracy`…), `PaymentRequest` + `PaymentStatus`, `ContestInfo`, `Notification`, `ReadNotificationRecord`.
- ✅ `Achievement` duplicate declarations merged into one (with `id` **and** `progress`); empty `interface UserStat {}` deleted; `any` fields (`setParams`, `reply_markup`) are `unknown` — neither is consumed.
- ⚠️ Still two competing stats models/two endpoints for one concept: `UserStats` (snake_case, `/submission/statistics/:id`, Statistics page) vs `user.user_stats` (camelCase, `/submission/statistics-profile/:id`, Profile). Unifying needs a backend decision.
- `lib/data.ts`: static badge catalog (fake `earnedDate`s removed — Profile now shows no date unless a real one exists).
- Whole-tree typing: zero `any` in `src/` (enforced by lint config + verified by grep).

## 8. Running

```bash
npm install
echo "VITE_API_BASE_URL=http://localhost:8080" > .env
npm run dev        # Vite; best opened inside Telegram (WebApp SDK required)
npm run lint       # eslint . — must stay clean (0/0)
npm run build      # tsc -b && vite build
```

`vercel.json` provides SPA fallback rewrites. The only env var the app itself consumes is `VITE_API_BASE_URL` (`services/api.ts`). In `import.meta.env.DEV` the app additionally installs `src/lib/devTelegramMock.ts` by default — a fake `window.Telegram.WebApp` (user id 999001) so the whole app runs in a plain browser without Telegram; set `VITE_MOCK_TELEGRAM=false` in `frontend/.env.local` to opt out (e.g. when testing inside a real client). Never active in production builds. ⚠️ The Stars-payment flow additionally requires the backend to expose `/api/telegram/*` proxies (deploy pending).

## 9. Issue catalog — status

Original IDs from the audit. ✅ fixed in this pass · 🟡 partially fixed · ❌ open (needs decision/backend).

### Security / integrity
- **S1. Live bot token in frontend** — ✅ **fixed.** `telegramApi` deleted from `api.ts`; Bot API calls moved behind new backend proxies (`telegramServices.ts` + Go handlers). ⚠️ **The old token is still in git history — revoke it via @BotFather, and deploy the backend.**
- **S2. No `initData` validation** — ❌ open. Identity is whatever `initDataUnsafe.user.id` says; needs a server-side HMAC validation + real session token (backend work).
- **S3. Client-computed contest scores** — ❌ open. `Contest.tsx` still computes and POSTs the score; `time_taken: 60` hardcoded. Needs server-side scoring decision.
- **S4. Client-declared payment status** — ❌ open. `Payment.tsx` still sends `status:"Approved"`; needs backend reconciliation with Telegram.
- **S5. XSS via article HTML** — ✅ **fixed.** DOMPurify sanitization before `dangerouslySetInnerHTML`.

### Correctness
- **B1. Double `AuthProvider`** — ✅ fixed (single tree in `App.tsx`).
- **B2. Unstable hook identities** — ✅ fixed (`useTelegram` memoized; effect deps corrected across Layout, AdTrigger, ArticleView, AIPractice, Leaderboard, WelcomeCarousell, Contest, ContestCard, LeaderboardModal). The one intentional exception: `Contest.tsx` countdown effect omits the recreated `handleContestEnd` (documented `eslint-disable` — adding it would restart the 1s timer each render; goes away with the S3 refactor).
- **B5. `??` precedence bugs** — ✅ fixed (name concat, comment count, `Number(x) ?? 0` no-op, `"12"` fallback user_id).
- **B6. 0-based vs 1-based answer indices** — ❌ open (fixing changes stored-data semantics; needs coordination with backend/historical data).
- **B7. Grade format mismatch** — ✅ fixed end-to-end ("1".."13" everywhere).
- **B9. State mutation** — ✅ fixed (`.sort()` copies, NotificationCenter mutations removed, `updatedAnswers` copy).
- **B10. Crash/stale risks** — ✅ fixed (`read_notifications` guards, Profile init from null-safe user, `stats.subjects` guard).
- **B11. Side effects during render** — ✅ fixed (Telegram calls moved into effects in Home, ContestEditorial, ArticleList, Payment).
- **B12. Fetch races** — ✅ fixed (AbortController/ignore-flag in Home, Contest, Leaderboard, ArticleList/View, Profile, NotificationContext; cancelled/aborted requests — StrictMode double-mount, Vite dev reload — are classified by `isAbortedRequest()` in `services/api.ts` and no longer flash "Authentication Failed"/"could not load banks"/"Request aborted" error states; `getNotification` now always returns an array via `normalizeNotifications()`). 🟡 `updateStudentDefaultScoreRange` GET-modify-PUT lost-update race still exists (needs a backend conditional update).
- **B13. Empty-state guard** — ✅ fixed.
- **B15. NaN percentages** — ✅ fixed (Leaderboard + LeaderboardModal).
- **B16. Registration payload discarded** — ✅ fixed (form fields sent; participants count real; `contestInfo.id` guarded instead of `!`-asserted).
- **B17. Reload-based retry** — ✅ fixed (refetch via state tick instead of `window.location.reload()`).
- **B18. Navigation** — ✅ fixed (`path="*"` 404 route, `<Link to="">`/`to="#"` removed, `navigate` instead of `location.replace`; the 10s `setTimeout` before navigate in Contest remains as UX, harmless).
- **B22. Article filters broken** — ✅ fixed (`"all"` sentinel honored).
- **B23. tsconfig gap** — ✅ fixed (`@/*` paths added; `tsc -b` now part of build and green).

### Dead code / duplication
- **B3. Two error-UI conventions** — ❌ open (unifying `ErrorComponent`/`ErrorState` was deferred deliberately).
- **B4. Two collapsibles** — ✅ fixed (Radix `ui/collapsible.tsx` deleted, its orphan keyframes removed from `index.html`, `@radix-ui/react-collapsible` dep dropped).
- **B8. Dead code** — ✅ mostly fixed: `ProTips.tsx`, `payment-history/payment-timeline.tsx`, `ui/sonner.tsx` (+`next-themes`), FeedBack `if (false)` block, Statistics mock block, dead Contest error block and registration skeleton all deleted; `deleteNotification` wired up. 🟡 still present by decision: screenshot-protection system (dead), AIPractice unreachable UI (`ComingSoon`), `AdTrigger` commented out.
- 🟡 `useContestTimer` exact-boundary miss — minor, open.

### UX / hygiene
- **B14. Invalid classes/constants** — ✅ fixed (`--success`/`--warning` vars defined, `pt-30`/`z-100` corrected, hex-as-class fixed).
- **B19. A11y** — ✅ mostly fixed (BottomNavigation semantics, button labels, SelectItem keys, receipt modal focus handling; inline toast styles cleaned).
- **B20. Hardcoded values** — ✅ fixed. Bank list + transfer account numbers served by `/api/banks` CRUD (admin-configurable, e2e-verified); `"112pay"` fallback removed; `debug:true` Adsgram (now `import.meta.env.DEV`); missing 10MB upload check (now validated); `"shuluqa"` name fallback removed; `picsum.photos` thumbnail fallback replaced by a deterministic gradient + first-letter placeholder (ArticleView/ArticleCard, share payload sends `thumbnail_url` only when a real thumbnail exists); "Adama"/"Oromia" registration defaults removed with region made required; fake `earnedDate`s in `lib/data.ts` emptied and Profile renders dates only when real; FeedBack textarea `maxLength={500}`; fabricated "+12%/+5%/−3s/+28" trend chips deleted from Statistics. Remaining hardcoded copy (carousel slides in `lib/data.ts`, contact number) is content, not correctness.
- **B21. Typos & leftovers** — ✅ fixed (user-facing strings corrected, `"use client"` removed, Telegram `showConfirm` replaces `window.confirm/alert`, unencoded URLs fixed, zod max/message mismatch fixed). File/route renames (`StudentRegisteration`, `FeedBack`, `WelcomeCarousell`, `newBadge.tsx`) deferred — they churn routes/history for cosmetic gain. 🟡 heavy `console.log` in FeedBack/services reduced, some remain.

## 10. Remaining recommendations

**P0 — Security (needs backend + your go-ahead)**
1. **Revoke the leaked bot token via @BotFather** (it lives in git history even though the code reference is gone) and deploy the backend so `/api/telegram/*` proxies are live.
2. Validate `initData` server-side (HMAC with bot token) at a login/exchange endpoint; issue a real session token; add a 401→re-auth axios interceptor. (S2)
3. Score contests and confirm payments server-side — submit only answers + real elapsed time; reconcile Stars via backend getUpdates/webhook. (S3, S4)

**P1 — Correctness**
4. Unify answer-index conventions across AIPractice / Contest / ContestEditorial — requires a migration plan for existing submissions. (B6)
5. ~~Replace hardcoded operational content with config~~ — done (B20 ✅); what remains is product copy (carousel slides, contact number).
6. Make `updateStudentDefaultScoreRange` race-safe server-side (conditional update). (B12 remainder)

**P2 — Decisions to make (currently parked)**
7. AIPractice: ship the existing UI or delete it; screenshot protection: enable or remove; Adsgram: gate content or remove `AdTrigger`; unify `ErrorComponent`/`ErrorState` and `UserStats` vs `user_stats`. (B3/B8)

**P3 — Performance & product**
8. `React.lazy` + `Suspense` for the 13 routes (bundle is ~1.5 MB / 466 kB gzipped; vite warns at build).
9. Adopt react-query/SWR for standardized loading/error/retry; add `.env.example`, CI (`tsc -b`, `eslint .`, build), and smoke tests for services/contexts.
