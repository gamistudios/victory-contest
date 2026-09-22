# Victory Contest

A student coding/quiz-contest platform delivered as a **Telegram Mini App**, targeting Ethiopian students. Participants register via Telegram, take timed multiple-choice contests, climb leaderboards, earn badges, pay for premium features, read articles, get AI-generated practice questions and study recommendations, and submit feedback surveys. A separate admin web panel manages contests, questions, feedback, and payments.

```
victory-contest/
├── backend/     Go API (Gin + DynamoDB + Gemini + Cloudinary + Telegram bot)  → backend/README.md
└── frontend/    React + TypeScript + Vite + Tailwind SPA (Telegram Mini App)  → frontend/README.md
```

See [`backend/README.md`](backend/README.md) and [`frontend/README.md`](frontend/README.md) for deep documentation of each tier, including complete route maps, business flows, and known-bug lists.

## High-level architecture

```
┌──────────────────────────┐   Telegram client (Mini App)
│  frontend/ (Vite + React)│   https://victory-contest.vercel.app
│  Tailwind + shadcn/ui    │
└───────────┬──────────────┘
            │ axios (JSON + multipart), withCredentials
            ▼
┌──────────────────────────┐        ┌─────────────────────────────┐
│  backend/ (Go, Gin)      │  JWT   │  Admin panel                │
│  :8080  /api/...         │◄──────►│  victory-admin-page.*       │
└───┬──────┬──────┬────────┘ cookie └─────────────────────────────┘
    │      │      │
    ▼      ▼      ▼
DynamoDB  Gemini  Cloudinary      Telegram Bot API (welcome message,
(eu-north-1) (AI)  (images)        Stars invoices, webhook)
```

- **Backend** — layered (domain / repository / usecase / handler) composition root in `backend/internal/handler/http/router.go`; DynamoDB is the only datastore (15 tables, per-table GSIs); Google Gemini `gemini-2.5-flash` for AI features; Cloudinary for image hosting; a Telegram bot sends the `/start` welcome with the WebApp button.
- **Frontend** — React 18 SPA, `react-router-dom` v7, plain axios (no data-fetching layer), Telegram WebApp SDK + Adsgram SDK loaded via `<script>` tags; auth state derived from `Telegram.WebApp.initDataUnsafe.user`; deploys to Vercel (SPA rewrites in `frontend/vercel.json`).

## Feature matrix

| Feature | Backend surface | Frontend surface |
|---|---|---|
| Student registration (Telegram ID) | `POST /api/student/` | `/register` (`StudentRegisteration.tsx`, react-hook-form + zod) |
| Contests: CRUD, clone, announce | `/api/contest/*` | `/` Home, `/registration`, `/contest/:id` |
| Questions (multipart images → Cloudinary) | `/api/question/*` | contest UI, editorial view |
| Submissions & client-computed scoring | `POST /api/submission/` | `Contest.tsx` |
| Leaderboards (global/per-contest) | `/api/submission/leaderboard`, `/rank/:id` | `/leaderboard`, `LeaderboardModal` |
| Badges/achievements | badge evaluation in `submission_usecase.go` | `Profile.tsx` |
| Payments (bank-transfer screenshot + manual approval) | `/api/payment/*`, premium check | `/payment`, `/payment-history`, Telegram Stars path |
| Notifications (DB-driven, broadcast + personal) | `/api/notification/*` | `NotificationCenter`, polling-free one-shot fetch |
| AI practice & study recommendations (Gemini) | `POST /api/ai/practice`, `/getRecommendation` | `/ai-practice` (currently "Coming Soon"), `/statistics` panel |
| Articles + comments + likes/views | `/api/articles*` | `/article`, `/article/:id` |
| Feedback surveys/polls + analytics | `/api/feedback-*`, `/api/poll-option` | `/feedback` |
| Contest demographic statistics | `/api/statistics/contest/:id/*` | `/statistics` |
| Pageview analytics | `/api/pageview/*` | (admin panel) |
| Anti-cheat (screenshot protection) | — | `useScreenshotProtection` (currently disabled) |
| Ads monetization (Adsgram) | — | `useAdsgram`/`AdTrigger` (currently disabled) |

## Current state & priority issues

> ✅ The backend now compiles: the missing brace in `CommentRepository` (`backend/internal/usecase/interfaces.go:152`) and a `log.Printf` vet finding were fixed on 2026-09-23; `go build`, `go vet` and a live boot smoke test against the real AWS account all pass.

Top cross-cutting issues (full lists in the tier READMEs):

1. **Committed secrets** — the Telegram bot token is hardcoded in `backend/internal/handler/http/router.go:39` *and* in `frontend/src/services/api.ts:10-13`; the admin JWT secret is hardcoded in `backend/internal/handler/http/admin_handler.go:45,144`. All must be revoked/rotated and moved to environment variables immediately.
2. **No authentication on any API route** — students are never verified via Telegram `initData` HMAC, admin CRUD endpoints are public, and `SignIn` (`backend/internal/repository/admin_dynamo.go:141-167`) never compares passwords.
3. **Client-trusted integrity** — contest scores, payment status (`status=Approved` self-declared), and student identity all come from the client; leaderboards and premium are trivially gameable.
4. **Broken code paths** — `GET /api/student/paid` always 500s (DynamoDB Query without key condition, confirmed by smoke test), `GET /api/payment/` uses a hardcoded debug key and returns empty (confirmed), and several missing `return`s cause double response writes.
5. **No tests, CI, IaC, or pagination** — zero test files in either tier; DynamoDB tables/GSIs exist only in the cloud (nothing in-repo); every Scan/Query ignores `LastEvaluatedKey`, so results silently truncate past 1 MB.

## Getting started

### Backend

```bash
cd backend
cp .env.example .env   # fill in AWS + Gemini + Cloudinary credentials
go run .               # loads .env via main.go, serves on :8080
```

Note: region and all DynamoDB table names are currently **hardcoded** in `internal/handler/http/router.go` despite `.env.example` listing them.

### Frontend

```bash
cd frontend
npm install
echo "VITE_API_BASE_URL=http://localhost:8080" > .env
npm run dev            # Vite dev server; open inside Telegram or mock WebApp
```

## Repository docs

- [`backend/README.md`](backend/README.md) — architecture, full API route map, domain model, DynamoDB design, configuration, bug list, recommendations.
- [`frontend/README.md`](frontend/README.md) — routing, state/auth model, API services, pages, hooks, bug list, recommendations.
- [`backend/CONTEST_STATISTICS_README.md`](backend/CONTEST_STATISTICS_README.md) — statistics subsystem spec (pass threshold, score buckets, endpoints).
- [`backend/FEEDBACK_SYSTEM_README.md`](backend/FEEDBACK_SYSTEM_README.md) — feedback system migration guide (entities, endpoints, poll business rules).

## Roadmap / recommendations (summary)

- **~~Fix build~~ & secrets** → build is fixed; rotate all tokens, scrub git history.
- **Real auth** → verify Telegram `initData` HMAC for students; JWT middleware + bcrypt for admins; server-side scoring and payment reconciliation.
- **Repair broken endpoints** (payment create/list, student/paid, admin lookup panics) and add response helpers with correct status codes.
- **Data layer** → shared DynamoDB client, env-driven config, `LastEvaluatedKey` pagination, GSIs replacing Scan+Filter hot paths, conditional writes for read-modify-write races (badges, registration IsActive).
- **Engineering hygiene** → tests (usecase unit + DynamoDB Local integration), CI (`go build/vet/test`, `tsc -b`, eslint), structured logging, rate limiting on `/api/ai/*`, Dockerfile + IaC, error boundaries and a data-fetching layer (react-query) on the frontend, route-level code splitting, DOMPurify for article HTML.
