# Victory Contest — Frontend (React + TypeScript)

The Telegram Mini App client for Victory Contest ("Ayahuna / Victory Contest") — a timed quiz/coding-contest platform for Ethiopian students. Runs inside Telegram (`window.Telegram.WebApp`), identifies users by `initDataUnsafe.user.id`, and talks to the Go backend in `../backend` via axios. Deploys to Vercel.

## Contents

1. [Tech stack](#1-tech-stack)
2. [Structure & routing](#2-structure--routing)
3. [State management & auth](#3-state-management--auth)
4. [API layer](#4-api-layer)
5. [Pages](#5-pages)
6. [Key hooks & mechanics](#6-key-hooks--mechanics)
7. [Types & data models](#7-types--data-models)
8. [Running](#8-running)
9. [Bugs & code issues](#9-bugs--code-issues)
10. [Recommendations](#10-recommendations)

---

## 1. Tech stack

From `package.json`:

- **Core:** React 18.3.1, TypeScript ~5.5.3, Vite 5.4.2 (`@vitejs/plugin-react`, `vite-plugin-svgr` for `*.svg?react`).
- **Routing:** `react-router-dom` ^7.0.2.
- **Data:** plain **axios** ^1.7.9 — *no* react-query/SWR; every page hand-rolls `useState` + `useEffect` + axios.
- **Forms:** `react-hook-form` ^7.54.2 + `zod` ^4.1.13 + `@hookform/resolvers`.
- **UI:** shadcn/ui ("new-york", `components.json`) over ~16 Radix primitives, Tailwind 3.4 + `tailwind-merge` + CVA, `lucide-react`, `framer-motion` ^12, `recharts` ^3.2, `sonner` ^2 (toasts), `vaul` (drawer), `date-fns` ^4.
- **SDKs via `<script>` in `index.html`:** `telegram-web-app.js` and Adsgram `sad.min.js` (typed in `src/types/adsgram.d.ts`) — not npm deps.
- **Deploy:** `vercel.json` SPA rewrite. **No tests, no CI, no `.env.example`.**
- Oddities: `@types/react-router-dom` and `caniuse-lite` sit in `dependencies`; `next-themes` is used only by dead `src/components/ui/sonner.tsx`.

## 2. Structure & routing

```
src/
├── main.tsx          StrictMode + createRoot(<App/>) — no providers here
├── App.tsx           gates tree on useTelegram().isLoading; wraps in AuthProvider; all routes under Layout
├── pages/            13 route components (see §5)
├── components/       feature components + article/ + payment-history/ + ui/ (shadcn)
├── context/          AuthContext.tsx, NotificationContext.tsx
├── hooks/            useTelegram, useAdsgram, useContestTimer, useScreenshotProtection
├── services/         api.ts (axios instances) + per-feature service modules
├── types/            index.ts, article.ts, adsgram.d.ts, svg.d.ts
├── lib/              utils.ts (cn), data.ts (static badge catalog)
└── assets/           SVG illustrations/icons only
```

Routes (all in `App.tsx`, flat under one `Layout`; **no lazy loading, no `path="*"` 404**):

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

`Layout.tsx` wraps children in TopNavigation (optional) + fixed BottomNavigation (hidden on `/register`), mounts `NotificationProvider` — and **a second `AuthProvider`** (`Layout.tsx:100`; see bug B1). Theme: purple Telegram header `#8b5cf6`, three Google fonts, global `user-select:none`, radix-collapsible keyframes in `index.html` for a component never imported.

## 3. State management & auth

**`AuthContext.tsx`** — the only session concept:
- Reads `initDataUnsafe.user` via `useTelegram` → `getStudentById(user.id)` (`:38-50`). Found → logged in.
- Guard by `location.pathname` string compare (`:66-82`): renders Loader / `ErrorState` / `<Navigate to="/register">` for unregistered users, and navigates registered users away from `/register`.
- **No Telegram `initData` HMAC validation, no tokens, no refresh, no logout.** Relies on `withCredentials:true` cookies (`services/api.ts:6-8`).

**`NotificationContext.tsx`** — one-shot fetch keyed on `user?.id`; filters "deleted" notifications via `userInfo.read_notifications[no.id]` (`:53-58`, crash risk B10). No polling/websocket.

**Elsewhere:** per-page `useEffect` fetches with inconsistent dep arrays; Telegram **CloudStorage** (with `telegram_cloud_*` localStorage fallback, `hooks/useTelegram.ts`) is a second persistence layer for article bookmarks/read state and a feedback flag.

## 4. API layer

`src/services/api.ts`: `baseURL = import.meta.env.VITE_API_BASE_URL + "/api"`, `withCredentials: true`, default JSON headers. **No interceptors at all.** ⚠️ `:10-13` also creates a `telegramApi` instance with a **hardcoded Telegram bot token** pointing straight at `api.telegram.org` — a live secret in shipped frontend code (see S1).

Endpoints per service:

| Service | Endpoints |
|---|---|
| `studentServices.ts` | GET/PUT `/student/:id` · POST `/student/` · GET `/submission/statistics-profile/:id` |
| `contestApi.ts` | GET `/contest/status/active` · GET `/contest/:id` · GET `/submission/rank/:id` · GET/POST `/contest-registration/[check/:sid/:cid]` · POST `/submission/` · GET `/submission/editorial/:sid?contest_id=` · GET `/contest-registration/contest/:id` (response key `registerations` mirrors backend typo) |
| `aiService.ts` | POST `/ai/getRecommendation` · POST `/ai/practice` |
| `articleService.ts` | GET `/articles/published?number=` · GET `/articles/:id` · GET/POST `/articles/:id/comments` · PUT `/articles/:id` · PATCH `/articles/:id/stats` — **plus** `createInvoiceLink` / `savePreparedInlineMessage` called directly on `telegramApi` (Bot API misplaced in the article service) |
| `notificationService.ts` | GET `/notification/recipient/:id` · PATCH/DELETE `/notification/:id` — the whole module is **never imported**; delete is done via a `read_notifications` flag instead (`NotificationCenter.tsx:69-93`) |
| `paymentServices.ts` | POST `/payment/` (multipart; locally disables `withCredentials`) · GET `/payment/:userId` |

## 5. Pages

1. **Home** — active-contest card, contest cards filtered `con.grade === userInfo?.grade` (`:79` — breaks with grade format bug B7), countdown, welcome carousel, editorial links.
2. **Contest** — the exam screen: question dots + dropdown nav, timer, submit; **score computed client-side** (`:279-305`); unanswered sent as `selected_answer:-1`; hardcoded `time_taken: 60` (`:165,200,238`).
3. **Leaderboard** — podium (assumes `entries[0]` is rank 1, `:270`), list, "you" panel; divide-by-zero NaN percentages (`:327-331,379-383`).
4. **Statistics** — recharts line/area/radar, stat cards with **fabricated trend deltas** "+12%/+5%/-3s/+28" (`:386,402,418,434`), premium-gated AI recommendation panel (`:696`), 75-line commented mock block (`:104-179`).
5. **Profile** — edit student form (grade/school/phone/timezone), badge grid from static `lib/data.ts`, PUT `/student/:id`.
6. **ContestStudentRegistration** — contest info + register; collects grade/subjects/experience but **never sends them** (`:142`); participants array rendered as a count (`:60` vs `:213`).
7. **ContestEditorial** — post-contest review via `?contest_id`; decodes stored answers 1-based (`:396` — convention conflict B6).
8. **AIPractice** — full practice UI (timer, settings `:331-410`) that is **unreachable**: `return <ComingSoon/>` at `:328`.
9. **Articles** — wrapper over `ArticleList` + `ArticleFilters`; `ArticleView` renders article HTML with `dangerouslySetInnerHTML` (`:457`).
10. **StudentRegisteration** *(sic)* — RHF+zod signup (photo URL, name, phone, grade "1".."13", defaults city "Adama"/region "Oromia" `:75-76`), then `window.location.replace("/")` (`:109`).
11. **Payment** — bank-transfer screenshot upload (hardcoded US bank list `:55-65` + Ethiopian CBE drawer accounts `:267-285`) and Telegram Stars `openInvoice` path that submits `status:"Approved"` from the client (`:164-175`).
12. **UserPaymentHistoryPage** — timeline via `PaymentTimelineItem` (imports the item directly; the parent `payment-timeline.tsx` is orphaned).
13. **FeedBack** — multi-section survey persisted to CloudStorage + `updateUserInfo`; contains a ~140-line `if (false && …)` dead block (`:627-770`).

## 6. Key hooks & mechanics

- **`useTelegram.ts`** — reads `window.Telegram.WebApp` once; sets header/background; ~25 wrappers (haptics, CloudStorage+fallback, MainButton/BackButton, `openInvoice`, `shareMessage`). Recreates all function identities each render (no memoization → root cause of several loops, B2).
- **`useAdsgram.ts`** — SDK init with `debug: true` (`:25-26`); `show()` → `onReward/onError`. **No content is ad-gated**: `<AdTrigger>` is commented out in `Layout.tsx:108`.
- **`useContestTimer.ts`** — 1s tick → UPCOMING/ACTIVE/ENDED; misses exact `=== startTime` boundary; clears interval on ENDED.
- **Anti-cheat** — `useScreenshotProtection.tsx` + `ScreenProtection.tsx`: blocks DevTools key combos, PrintScreen clipboard clear, contextmenu, injected `user-select:none`, 3-finger overlay, monkey-patched `getDisplayMedia`; returns hardcoded `{isProtected:true}` (`:284-286`). **Entirely dead** — its only consumer is imported in a commented line (`App.tsx:19`), and its techniques are cosmetic on mobile anyway.
- **`NotificationCenter.tsx`** — drawer from TopNavigation; `markAllAsRead` (`:46-61`) **overwrites the whole `read_notifications` map**, resurrecting deleted items; in-place mutation at `:76`; duplicated "Mark as read" buttons (`:252-261`, `:268-277`).
- **`PaymentAlert.tsx`** — expiry banner; loop `break`s at the first non-expiring approved payment (`:42`) so later payments are never checked; non-null `expirationDate!` (`:41`).
- **`LeaderboardModal.tsx`** — fetch on empty deps (`:41`), podium icons by array index not `entry.rank` (`:149`), unencoded title in URL (`:62`), errors collapse to `[]`.
- **`BottomNavigation.tsx`** — items are click-handler `<div>`s with no link/button semantics or keyboard access (`:50-52`); imports an asset whose filename contains a space and "(1)".

## 7. Types & data models

`src/types/index.ts`: `TelegramWebApp`/`TelegramUser`, `Question`, `ContestAnswer`, `Student`/`AuthUser`, `Contest`, `LeaderboardEntry`, `UserStats` (snake_case: `total_contests`, `average_accuracy`…), `PaymentRequest` + `PaymentStatus`, `ContestInfo`, `Notification`, `ReadNotificationRecord`.
- ⚠️ `Achievement` is **declared twice** with different shapes (`:196-204` and `:295-303` — second silently wins).
- ⚠️ Empty `interface UserStat {}` (`:205`).
- ⚠️ Two competing stats models/two endpoints for one concept: `UserStats` (snake_case, `/submission/statistics/:id`, Statistics page) vs `user.user_stats` (camelCase, `/submission/statistics-profile/:id`, Profile).
- `lib/data.ts`: static badge catalog with fake `earnedDate`s (`:11,41`) even on `earned:false` badges — surfaced in Profile.

## 8. Running

```bash
npm install
echo "VITE_API_BASE_URL=http://localhost:8080" > .env
npm run dev        # Vite; best opened inside Telegram (WebApp SDK required)
npm run build      # tsc -b && vite build — see B23: tsc fails on @/ imports
```

`vercel.json` provides SPA fallback rewrites. No `.env.example` exists; the only env var consumed is `VITE_API_BASE_URL` (`services/api.ts:4`).

## 9. Bugs & code issues

### Security / integrity
- **S1. Live bot token in frontend source** — `src/services/api.ts:10-13` hardcodes `https://api.telegram.org/bot<token>/…`; anyone who loads the bundle can act as the bot (invoices, refunds, user PII via `getChat`). Revoke + move behind backend endpoints (`articleService.ts:37-50` uses it for `createInvoiceLink`).
- **S2. No `initData` validation** — `AuthContext.tsx:38-50`: identity is whatever `initDataUnsafe.user.id` says; spoofable with one curl (mirrors the backend gap).
- **S3. Client-computed contest scores** — `Contest.tsx:279-305` computes and POSTs the score; `time_taken: 60` hardcoded (`:165,200,238`). Leaderboard fully gameable.
- **S4. Client-declared payment status** — `Payment.tsx:164-175` sends `status:"Approved"` itself after the Stars invoice resolves; never reconciled with Telegram on the server.
- **S5. XSS via article HTML** — `ArticleView.tsx:457` `dangerouslySetInnerHTML` with no sanitizer.

### Correctness
- **B1. Double `AuthProvider`** — `App.tsx:47` + `Layout.tsx:100`: two independent auth trees, two `/student/:id` fetches, possible state desync.
- **B2. Unstable hook identities** — `useTelegram` recreates ~25 functions per render; `ArticleView.tsx:310-321` lists `getCloudData` in effect deps → article-load effect re-runs every render; `Contest.tsx:118` reads route param `conId` outside deps.
- **B5. `??` precedence bugs** — `Payment.tsx:167`, `ArticleView.tsx:110`: `first_name ?? "" + last_name` binds as `first_name ?? (""+last_name)`; `ArticleView.tsx:108` `comments?.length ?? 0 + 1`; fallback user_id `"12"` (`:111`).
- **B6. 0-based vs 1-based answer indices** — `AIPractice.tsx` stores 0-based; `ContestEditorial.tsx:396` decodes `-1` as 1-based; `Contest.tsx:468` `selectedAnswer! - 1 === index`; `-1` doubles as "unanswered" sentinel → editorial/grading display corrupts.
- **B7. Grade format mismatch** — `StudentRegisteration.tsx:256` creates grades `"1".."13"`; `Profile.tsx` saves `"9".."12"`; `Home.tsx:79` filters `con.grade === userInfo?.grade` → new registrants see **no contests**.
- **B10. Crash/stale risks** — `NotificationContext.tsx:53-58` indexes `userInfo?.read_notifications[...]` (throws when field undefined; `userInfo` missing from deps); `Profile.tsx:105-118` initializes from possibly-null `user` (age default `"5"` `:115`), missing dep `:198`; `Statistics.tsx:246` `Object.keys(stats.subjects)` unguarded.
- **B12. Fetch races** — Home/Contest/Leaderboard/ArticleList/ArticleView/Profile set state after unmount (no AbortController/ignore flags); `studentServices.ts:28-46` GET-modify-PUT `updateStudentDefaultScoreRange` is a lost-update race.
- **B15. NaN percentages** — `Leaderboard.tsx:327-331,379-383`, `LeaderboardModal.tsx:175` divide by zero totals.
- **B16. Registration payload discarded** — `ContestStudentRegistration.tsx:142` sends only `{student, contest}`; participants array vs count (`:60` vs `:213`).
- **B22. Article filters broken** — `ArticleFilters.tsx:154,240-242` set `"all"` as sentinel but `ArticleList.tsx` (~`:94-96`) only treats `""` as unfiltered → "All Authors"/"All Tags" shows **zero** results.

### Dead code / duplication
- **B3. Two error-UI conventions** — `ErrorComponent.tsx` (banner; used by Home/ArticleList/ArticleView) vs `ErrorState.tsx` (full page; used only by AuthContext); `ErrorIllustration` exported unused.
- **B4. Two collapsibles** — custom `ui/Collapse.tsx` (used at `Profile.tsx:35`) vs Radix `ui/collapsible.tsx` (**never imported** — dead; yet `index.html` ships its keyframes).
- **B8. More dead code** — `AIPractice.tsx:328` ComingSoon orphans its whole UI (`:331-410`, duplicate `formatTime` `:111`&`:412`); `Contest.tsx:23` error never set → dead block `:359-369`; `ContestStudentRegistration.tsx:33` loading never true → skeleton `:181-193`; `ProTips.tsx:10-13` renders hardcoded empty arrays, used by nobody; entire screenshot-protection system dead (`App.tsx:19` commented); `payment-history/payment-timeline.tsx` orphan; `ui/sonner.tsx` unused (sole reason `next-themes` is a dep); `deleteNotification` (notificationService.ts:16) never called; `FeedBack.tsx:627-770` `if (false && …)`; big commented blocks `Layout.tsx:18-87`, `Statistics.tsx:104-179`.
- **B9. State mutation** — `NotificationCenter.tsx:76` mutates fetched object; markAllAsRead overwrites map; `Home.tsx:144` `.sort()` mutates state in render.
- **B11. Side effects during render** — Telegram calls directly in render bodies: `Home.tsx:34`, `ContestEditorial.tsx:140`, `ArticleList.tsx:68`, `Payment.tsx:223` (StrictMode double-fire; fights TopNavigation).

### UX / hygiene
- **B13** — `Home.tsx:123` renders empty-state without `!loading` guard alongside skeleton.
- **B14. Invalid classes/constants** — `ui/badge.tsx:19` `hover:bg-success/80`: `--success`/`--warning` CSS vars never defined (`index.css`) though `tailwind.config.js:56-62` references them; `Layout.tsx:112` `pt-30`; `payment-timeline-item.tsx:99` `z-100`; `Leaderboard.tsx:100` Tailwind class used as inline hex color.
- **B17** — retry = `window.location.reload()` (`Leaderboard.tsx:212`, `Statistics.tsx:349`).
- **B18. Navigation** — no `path="*"` 404; `Home.tsx:220-224` `<Link to="">`; `ContestCard.tsx:221` `to="#"`; full-page `window.location.replace` instead of `navigate` (`Payment.tsx:189`, `StudentRegisteration.tsx:109`); arbitrary 10s `setTimeout` before navigate (`Contest.tsx:322`); `not-found.tsx` is a props component, not a route.
- **B19. A11y** — BottomNavigation div-clicks; icon-only buttons without labels; `Profile.tsx:353-355` SelectItems missing keys; custom receipt modal without focus trap/Escape (`payment-timeline-item.tsx:96-132`); inline-styled `toast.error` (`NotificationCenter.tsx:86-91`).
- **B20. Hardcoded values** — `"112pay"` account (`Payment.tsx:112`); US banks vs Ethiopian CBE (`:55-65`, `:267-285`); `picsum.photos` thumbnails (`ArticleView.tsx:230`); `"shuluqa"` name fallback (`:110`); "Adama"/"Oromia" defaults; `debug:true` Adsgram in prod (`useAdsgram.ts:25-26`); ".../500" counter without maxLength (`FeedBack.tsx:1383`); 10MB claim with no check (`Payment.tsx:366`); `time_taken:60`.
- **B21. Typos & leftovers** — file/route `StudentRegisteration`, page `FeedBack`, `WelcomeCarousell`, `newBadge.tsx`; strings "Complete Registeration" (`ContestStudentRegistration.tsx:421`), "Sucessfully sent!" (`Payment.tsx:119`), "successfull"/"faild" (`:177/:205`), "Succesfully registered!" (`StudentRegisteration.tsx:97`), "photo number" (`:59`), "No standing found" (`Leaderboard.tsx:283`), "wr**o**nt" (`ArticleList.tsx:234`); `setpayments` (`PaymentAlert.tsx:17`); zod max(13) vs message "must not exceed 10" (`StudentRegisteration.tsx:60-61`); `zodResolver(... as any)` (`:68`); `"use client"` Next.js leftovers (`AIPractice.tsx:1`, `FeedBack.tsx:1`); `window.confirm/alert` inside Telegram (`FeedBack.tsx:477,559,563,568`); unencoded URL interpolation (`Home.tsx:197`, `LeaderboardModal.tsx:62`); dead branches (`QuestionNavigationDropdown.tsx:33-42` never returns "incorrect"; `Contest.tsx:64` ignores `isActive`, `:270` unreachable); no-op `onRetry` (`ArticleView.tsx:543`); mismatched post-length gates (`:596` vs `:106`); heavy `console.log` debugging (`FeedBack.tsx:197-264`, `studentServices.ts:28-46`, `paymentServices.ts:5-7`); `Profile.tsx:674` progress bar hardcoded `0%`, `:281` avatar shows full name, `:257` `unlockedAchievements` holds locked ones.
- **B23. tsconfig gap** — `@/...` imports (`ui/sheet.tsx`, `ui/scroll-area.tsx`, `ui/avatar.tsx`) have no `paths` entry in `tsconfig.app.json` while Vite aliases `@` (`vite.config.ts`) → `tsc -b` (part of `npm run build`) fails / IDE errors.

## 10. Recommendations

**P0 — Security**
1. Revoke the bot token; delete `telegramApi` from `api.ts:10-13`; proxy `createInvoiceLink`/Stars through the backend.
2. Validate `initData` server-side (HMAC with bot token) at a login/exchange endpoint; issue a real session token; add a 401→re-auth axios interceptor.
3. Score contests and confirm payments server-side (submit only answers + timing; reconcile Stars via backend).
4. Sanitize article HTML (DOMPurify) at `ArticleView.tsx:457`.

**P1 — Correctness**
5. Single `AuthProvider`; memoize `useTelegram`'s API once per `webApp`; fix effect deps (NotificationContext `userInfo`, ArticleView cloud deps); add AbortControllers to fetch effects.
6. Fix concrete breakages: ArticleFilters `"all"` sentinel, grade format end-to-end, registration payload, `??` precedence, `read_notifications` guards + merge semantics, NaN-percentage guards, `.sort()` mutation.
7. Wire the Stars flow to backend verification; remove client `status:"Approved"`.

**P2 — Cleanup**
8. Delete dead code (B3/B4/B8 lists), the `if (false)` block, `"use client"`, console.log noise; drop `next-themes`; unify on one error/loading/stats convention.
9. Add `paths: {"@/*": ["./src/*"]}` to `tsconfig.app.json`; fix `pt-30`/`z-100`/missing `--success`/`--warning`; rename misspelled files/strings; replace `window.confirm/alert/reload/replace` with sonner/Telegram dialogs/react-router; add a real `path="*"` route using `not-found.tsx`.

**P3 — Performance & product**
10. `React.lazy` + `Suspense` for the 13 routes (recharts/framer-motion/radix make the initial bundle heavy); adopt react-query/SWR for standardized loading/error/retry; a11y (real buttons in BottomNavigation, Radix Dialog for receipt modal); decide Adsgram/premium-gating direction (AdTrigger exists but is disabled); either re-enable or remove the screenshot-protection system; add `.env.example`, CI (`tsc -b`, eslint, build), and smoke tests for services/contexts.
