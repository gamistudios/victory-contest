# Victory Contest — Backend (Go)

The API server for the Victory Contest student-contest platform (Telegram Mini App + admin panel). Go 1.24, Gin, DynamoDB-only persistence, Google Gemini AI, Cloudinary image hosting, and a Telegram bot.

> ✅ **Build status (verified 2026-09-23):** `go build ./...` and `go vet ./...` are green after fixing the `CommentRepository` brace in `interfaces.go:150-152` and the `log.Printf` format bug in `article_usecase.go:101`. The server boots on `:8080` against the real AWS account and `GET /api/contest/` returns live data. Remaining hygiene: all files use CRLF line endings, so `gofmt -l .` flags every file (run `gofmt -w` in one dedicated commit if desired).
>
> 🔒 **Security progress (2026-09-23):** issues #2–#5 and #21 fixed — bot token and JWT secret moved to env (`TELEGRAM_BOT_TOKEN`, `JWT_SECRET`), admin passwords bcrypt-hashed and no longer leaked in responses, `SignIn` actually verifies passwords (with legacy-plaintext upgrade path). ⚠️ Ops follow-ups: get a fresh bot token from @BotFather (the committed one is already revoked by Telegram), and #6 (auth middleware) is still open.
>
> 🏦 **Banks (2026-09-23):** new `banks` table + `/api/banks` CRUD (see §5) — the frontend payment page now renders admin-managed banks instead of hardcoded lists. Verified end-to-end on the local dynalite stack.

## Contents

1. [Tech stack](#1-tech-stack)
2. [Architecture](#2-architecture)
3. [Running & configuration](#3-running--configuration)
4. [Domain model](#4-domain-model)
5. [API route map](#5-api-route-map)
6. [Business flows](#6-business-flows)
7. [DynamoDB design](#7-dynamodb-design)
8. [Existing docs](#8-existing-docs)
9. [Bugs & code issues](#9-bugs--code-issues)
10. [Recommendations](#10-recommendations)

---

## 1. Tech stack

Module `victor-contest-go` (note the typo — *victor*, `go.mod:1`), Go 1.24.4.

| Dependency | Role |
|---|---|
| `gin-gonic/gin v1.10.1` | HTTP framework |
| ~~`gin-contrib/cors v1.7.6`~~ | CORS middleware — **removed 2026-09-23**; custom `corsMiddleware` in `router.go` (see §9 #10) |
| `aws/aws-sdk-go-v2/*` | DynamoDB (the **only** database — no ORM/SQL) |
| `google/generative-ai-go v0.20.1` | Gemini AI (`gemini-2.5-flash`, `usecase/ai_usecase.go:136`) |
| `go-telegram-bot-api/telegram-bot-api/v5` | Telegram bot: `/start` welcome + WebApp button (`usecase/telegram_usecase.go:19-32`) |
| `cloudinary/cloudinary-go/v2` | Image hosting (question images, payment screenshots) |
| `golang-jwt/jwt/v5` | Admin session JWT (HS256) |
| `google/uuid`, `lithammer/shortuuid/v4` | Entity IDs |
| `joho/godotenv` | Loads `.env` (only from root `main.go`) |

There are **no test files, no Dockerfile, no CI config, no lint config** in this directory.

## 2. Architecture

Intended clean/layered layout with manual dependency injection:

```
backend/
├── main.go                 ← LIVE entry point: godotenv → NewServer → NewRouter → :8080
├── cmd/app/main.go         ← duplicate entry point that NEVER loads .env (dead code)
└── internal/
    ├── domain/             ← plain structs + DTOs (14 files)
    ├── repository/         ← DynamoDB access, one file per table (+ Cloudinary image repo)
    ├── usecase/            ← business logic; ports (interfaces.go) live HERE
    └── handler/http/       ← Gin handlers, each exposing RegisterRoutes(rg)
```

- **Composition root:** `handler/http/router.go` — `NewServer()` constructs 16 repositories (each independently calls `config.LoadDefaultConfig` → 17 SDK clients) and all usecases/handlers; `NewRouter()` applies CORS and mounts every handler under `/api/<feature>`.
- **Layer inversions:** `repository/payment_dynamo.go:9` and `notification_dynamo.go:7` import `internal/usecase` (repo → usecase direction reversed). `ContestStatisticsRepository` is constructed with a `nil` impl (`router.go:77`) and never used. Several usecases (`achievement`, `question`, `pageview`) are pure pass-throughs.

## 3. Running & configuration

```bash
cp .env.example .env   # CLOUDINARY_URL, GOOGLE_API_KEY, AWS creds, *_TABLE names, AWS_REGION
go run .               # from backend/ — serves on :8080
```

### Fully local dev/test stack (no prod contact)

`backend/.env` is currently a **local test config** (prod credentials are backed up in the repo-root `.env`, gitignored). Nothing in the local config can reach live services: dummy Cloudinary account, invalid Gemini key, no bot token, and `AWS_ENDPOINT_URL_DYNAMODB=http://localhost:8000` keeps every DynamoDB call on localhost (honored automatically by `LoadDefaultConfig` in all repos — zero code change).

```bash
npx -y dynalite --port 8000     # local DynamoDB (in-memory)
go run ./cmd/setup-tables       # idempotent: creates all 16 tables + every queried GSI
go run .                        # boots against the local stack
```

Verified end-to-end on the local stack (2026-09-23): student register/list/profile/quickstat, admin register + bcrypt login (200/401), question add (multipart, no image), contest add/get with hydrated questions, submission + leaderboard + rank, contest-registration check, notifications list, dashboard 200. `GET /api/student/paid` → 500 (#20) and `GET /api/payment/` → empty (#19) reproduce exactly as documented.

**Reality check:** only `GOOGLE_API_KEY` and the AWS credential chain (plus `CLOUDINARY_URL` implicitly) are actually consumed. `AWS_REGION` and every `*_TABLE` variable are **ignored** — region (`eu-north-1`) and all table names are hardcoded string literals in `router.go:42-59` (including the `contest_registeration` table-name typo). The Telegram bot token and JWT secret are **not in env at all** — both hardcoded (see Bugs #2, #3).

## 4. Domain model

| File | Entities & key fields |
|---|---|
| `student.go` | `Student{ID, TelegramID, Name, Age, Grade, School, City, Region, ImgURL, IsSuspended, PhoneNumber, Badge[]string, Gender, IsPremium, ReadNotifications map, DefaultScoreRange, CreatedAt}` + profile-statistics DTOs |
| `contest.go` | `Contest{ID, Title, Description, StartTime/EndTime (free-form strings), Subject, Grade, Prize, Questions []string (ids), Status, Type}`; `ContestTypeWithQuestionObj` = hydrated questions variant |
| `question.go` | `Question{ID, QuestionText, Answer int (correct index), QuestionImg, Explanation, ExplanationImg, Subject, Grade, Chapter, MultipleChoice[]string}` + `AiPracticeSetting` |
| `submission.go` | `Submission{ID, ContestID, StudentID, Student (sub-struct), Score float64, MissedQuestions[]{ID, SelectedAnswer}, SubmissionTime, TimeSpend "HH:MM:SS"}`, `LeaderboardEntry`, `Editorial`. ⚠️ Also implements `Error()` with `panic("unimplemented")` (`:20-22`) |
| `contest_registration.go` | `ContestRegistration{ID, ContestID, StudentID, IsActive, RegisteredAt}` |
| `pyament.go` (**filename typo**) | `PaymentRequest{ID, UserID, FullName, BankName, BillScreenshotURL, Status, RejectionReason, CreatedAt, UpdatedAt, ExpirationDate, GSI1PK}`; statuses `Pending/Approved/Rejected` |
| `achievement.go` | `Achievement{ID, Earned (student id), Name, Description, Type, EarnedDate, Rarity, Progress}` |
| `admin.go` | `Admin{ID, Email, IsApproved, Name, Password}` (plaintext!), `CustomClaims` JWT, dashboard DTOs (`DashboardStatsResponse`, distributions, trends) |
| `notification.go` | `Notification{ID, RecipientID ("all"=broadcast), Title, Message, IsRead, SentAt string, Type}` |
| `feedback.go` | `FeedbackQuestion`, `PollOption{Label, MinScore, MaxScore, RequiresContact}`, `FeedbackResponse{StudentID, Comment, PollResponse, ContactInfo, QuestionResponses map}` + analytics DTOs |
| `contest_statistics.go` | Computed DTOs only (never persisted): `ContestStatistics`, `CategoryStats`, `StudentContestPerformance`, `StatisticsFilters`, paginated `StudentPerformanceList` |
| `article.go` | `Article{...Status draft/published/archived, Author, Tags, Thumbnail, ReadTime, ViewCount, LikeCount, CommentCount}`, `Comment` |
| `pageview.go` | `PageView{ID, UserID, Page, UserAgent, IPAddress, Referrer, ViewedAt}` + stats DTOs |
| `ai_models.go` | `ChapterStats`, `RecommendationInput`, `PracticeStep`, `ResourceItem`, `Recommendations` |

## 5. API route map

Mounted under `/api/...` (`router.go:137-156`). **No route uses auth middleware** — the only protected endpoint in the entire system is `GET /api/admin/me`, which reads a JWT cookie inside the handler (`admin_handler.go:34-51`). Everything else is fully public.

### `/api/contest` (`contest_handler.go:27-35`)
`POST /add` · `PATCH /:id` · `GET /` · `GET /:id` · `DELETE /delete/:id` · `POST /clone/:id` · `POST /announce/:id`

### `/api/student` (`student_handler.go:22-35`)
`POST /` register · `PUT /:id` · `DELETE /:id` · `GET /` (**full student PII list**) · `GET /paid` (broken, #20) · `GET /quickstat/:id` (TODO stub) · `GET /rank` and `GET /rank/:contest_id` (**return nil, nil — stubs**) · `GET /:id` · `GET /grades-and-schools` · `GET /profile/:id` · `GET /profile-admin/:student_id`

### `/api/question` (`question_handler.go:24-31`)
`POST /add` (multipart → Cloudinary) · `POST /multiple-add` · `POST /multiple-delete` (`{"ids":[...]}`, chunked BatchWriteItem, per-id failures reported — added 2026-09-23 for client issue #4) · `PATCH /:id` (JSON *or* multipart) · `DELETE /delete/:id` · `GET /` (**returns correct answers**) · `GET /:id`

### `/api/submission` (`submission_handler.go:19-30`)
`POST /` (**client-computed score**) · `GET /` · `GET /contest/:contest_id` · `GET /student/:student_id` · `GET /leaderboard?timeFrame=today|week|month|all` · `GET /rank/:conId` · `DELETE /:id` (404 on missing row; added 2026-09-23) · `GET /:id` · `GET /editorial/:student_id?contest_id=` · `GET /statistics-profile/:student_id` · `GET /statistics/:student_id`

### `/api/admin` (`admin_handler.go:24-33`)
`POST /register` (**public admin creation**) · `PUT /:id` · `DELETE /:id` · `GET /:id` (looks up by *email*, #22) · `GET /me` (JWT cookie — the only guarded route) · `GET /` (**leaks plaintext passwords**) · `POST /login` (sets `token` cookie, SameSite=None; **no password check**, #4) · `GET /dashboard`

### `/api/notification` (`notification_handler.go:19-29`)
`POST /` · `PUT /:id` · `DELETE /:id` · `PATCH /:id/read` · `GET /` (dead — #29) · `GET /:id` · `GET /recipient/:recipient_id` · `GET /admin/:admin_email` · `POST /contest-announce`

### `/api/achievement` (`achievement_handler.go:19-26`)
Full CRUD — but nothing ever calls `AddAchievement`; the live badge system is `Student.Badge` in `submission_usecase.go:544-646`. This is **dead feature code**.

### `/api/contest-registration` (`contest_registration_handler.go:19-26`)
`POST /` · `PUT /:id` · `DELETE /:id` · `GET /check/:student_id/:contest_id` · `GET /isActive/:contest_id/:student_id` (check-then-set, racy #32) · `GET /contest/:contest_id` (count)

### `/api/feedback-question`, `/api/poll-option`, `/api/feedback-response` (`feedback_handler.go:26-34, 135-142, 228-240`)
Questions: CRUD + `GET /active` + `GET /admin/:admin_id`. Poll options: CRUD + `GET /score/:score`. Responses: CRUD + `GET /student/:id`, `/question/:id`, `/analytics?range=&admin_id=`, `DELETE /contact/:phone`, `DELETE /response-only/:id`, `GET /:id` (404 for unknown ids; the `/test` debug route was removed 2026-09-23).

### `/api/payment` (`payment_handler.go:22-29`)
`GET /` (fixed, #19) · `POST /update` (**public approve/reject**) · `POST /` (multipart; verified working end-to-end; does not accept `amount` yet) · `DELETE /:id` (404 on missing row; added 2026-09-23) · `GET /getexpired` · `GET /withstatus?status=` · `GET /:user_id`

### `/api/banks` (`bank_handler.go`)
`GET /` (active banks, ordered by `display_order`) · `GET /all` (incl. inactive, admin) · `GET /:id` · `POST /` · `PUT /:id` (omitted `is_active` preserves stored flag) · `DELETE /:id` — admin-managed payment bank list; replaces the values previously hardcoded in the frontend. Table `banks` (partition `id`), provisioned by `cmd/setup-tables`. Write routes inherit the open auth gap (#6).

### `/api/ai` (`ai_handler.go:18-22`)
`POST /practice` · `POST /getRecommendation` — no auth, no rate limit.

### `/api/telegram` (`telegram_handler.go:17-19`)
`POST /webhook` — **no secret-token verification** (#9), panics on non-message updates (#17).

### `/api/pageview` (`pageview_handler.go:20-23`)
`POST /track` · `GET /stats?days=30`

### `/api/articles*` (`article_handler.go:20-32`)
`GET /articles` · `GET /articles/published?number=` · `GET /articles/status/:status` · `GET /articles/:id` · `GET|POST /articles/:id/comments` · `PUT|DELETE /articles/:id/comments/:commentId` (added 2026-09-23; delete decrements the comment counter; author check waits on auth middleware) · `POST /articles` · `PUT|DELETE /articles/:id` · `PATCH /articles/:id/status` · `PATCH /articles/:id/stats` — all public.

### `/api/images` (`image_handler.go:19-23`)
`POST /upload` · `GET /list?folder=&max=` · `DELETE /delete?id=` — folder param ignored (# image repo), unauthenticated delete.

### `/api/statistics` (`contest_statistics_handler.go:21-25`)
`GET /contest/:contest_id/statistics` · `.../statistics/summary` · `.../statistics/students?page=&page_size=`

## 6. Business flows

### (a) Student auth / registration
**There is no student authentication.** `POST /api/student/` accepts a self-declared `telegram_id` + profile; **Telegram `initData` is never validated anywhere** (no HMAC check in the codebase). `IsPremium` is the only server-side gate — computed from approved, unexpired payments in `student_usecase.go:60-113` — but has a bypass (#8).

### (b) Contest lifecycle
Questions (multipart, images → Cloudinary, correct answer stored) → contest created referencing question IDs (`GenerateUniqueId()`) → students register (`contest-registration`, `IsActive=false` at creation; `GET /isActive/...` does a racy check-then-set) → client fetches contest with **hydrated questions including correct answers** (full scan per request, `contest_usecase.go:57`) → **client computes the score** and POSTs the submission (`submission_usecase.go:315-335`, stored verbatim) → badges evaluated via `defer` (`:544-646`): first-submission, fast solver (≤30s/10q), perfectionist (0 missed), 7-day streak, Math Wizard (≥90% in 5 math contests), Champion (global top-10) → leaderboards: global by timeframe top-100, per-contest by score/time.

### (c) Payments
**No payment-provider integration — not Click, not Uzum, not Payme, no webhooks.** A fully manual bank-transfer flow: student POSTs multipart (`user_id, fullName, bankName, status, img`) → screenshot to Cloudinary → record stored with **client-supplied status** → admin approves/rejects via `POST /payment/update` (`UpdateStatus` also writes a stray `reason` attribute, #43). Expiration GSI queries drive premium expiry. Note: frontend also has a Telegram Stars path, but the backend never reconciles it.

### (d) Achievements / (e) Notifications
Achievement table CRUD is dead code (§5). Notifications are **DB rows, not Telegram pushes**: `RecipientID` = student id or `"all"` broadcast, fetched via GSI `recipient_id-index`, can hide items older than student `CreatedAt` (`notification_usecase.go:131-147`). Fired from contest announce, student registration (wrong copy — #28), feedback question/response — all fire-and-forget goroutines with discarded errors (#53).

### (f) AI (Gemini)
`POST /ai/practice` — prompt returns 25 MC questions as JSON; raw text sliced between first `[` and last `]` (`ai_usecase.go:79-119`). `POST /ai/getRecommendation` — per-chapter accuracy → study-plan JSON (`:20-76`). Model `gemini-2.5-flash`, key from `GOOGLE_API_KEY`. No auth/rate-limit/cost control.

### (g) Feedback / (h) Statistics / (i) Pageviews / (j) Articles / (k) Images
Feedback: admin questions + score-range poll options (require contact info above thresholds) + student responses; analytics = **two full scans** in memory. Statistics: computed on demand (never persisted): best submission per student, pass ≥50%, buckets Excellent ≥90 / Good ≥70 / Average ≥50 / Fail, gender/city/school/grade breakdowns, paginated student lists. Pageviews: server-side IP/UA/referrer capture; stats via Scan with `viewed_at BETWEEN` **string** comparison. Articles: draft/published/archived CMS, default author `{ID:"1", Name:"Admin User"}`, read-time at 200 wpm, atomic `if_not_exists` counters, comments via GSI. Images: Cloudinary; `UploadImage` **ignores its folder param** (`image_repo.go:30-32`), constructor arg unused.

## 7. DynamoDB design

- One client per repository (17 × `LoadDefaultConfig`), region hardcoded `eu-north-1`, `context.TODO()` everywhere (no cancellation), failures `panic()` at startup.
- **Tables** (hardcoded `router.go:43-59`): `question, contests, student, submissions, admin, notification, achievement, contest_registeration (sic), payment, pageviews, articles, comments, feedback_questions, poll_options, feedback_responses, banks`.
- **Keys:** every table is single-partition `id` (S); no sort keys.
- **GSIs** (inferred from queries — **no IaC/creation code exists in-repo**): `payment` → `GSI1PK-user_id/status/expirationDate-index` (GSI1PK constant `"PAYMENT_REQUEST"`); `submissions` → `contest_id-index`, `student_id-index`, `contest_id-student_id-index`; `admin` → `email-id-index`; `notification` → `recipient_id-index`; `articles` → `status-index`; `comments` → `articleId-index`; `contest_registeration` → `contest_id-student_id-index`.
- **Scan vs Query:** many list/analytics paths are full Scans with FilterExpression (`GetStudentByTelegramID`, all feedback listings, all `GetAll*`, pageviews). **No call handles `LastEvaluatedKey`** → silent truncation past 1 MB. Two `Query` calls omit `KeyConditionExpression` entirely and fail at runtime (#20).

## 8. Existing docs

- **`CONTEST_STATISTICS_README.md`** — statistics subsystem spec: pass/fail threshold (≥50%), score buckets, demographic breakdowns, the three `/api/statistics/contest/{id}/*` endpoints with JSON examples, layer map, best-submission and pagination logic, future ideas (Redis cache, async jobs). Mostly accurate, but describes a `contest_statistics_dynamo.go` data layer that is never wired (nil at `router.go:77`).
- **`FEEDBACK_SYSTEM_README.md`** — Python/Firebase → Go/DynamoDB migration guide: three feedback entities and schemas, all `/api/feedback-*` and `/api/poll-option` endpoints, `requires_contact` business rules, setup steps. References port **8081** (code uses 8080) and a `cmd/setup-tables` project that **does not exist**; omits newer analytics/test/contact-deletion routes.

## 9. Bugs & code issues

### Blocking
1. ~~**Does not compile**~~ **FIXED 2026-09-23** — closing brace added to `CommentRepository` in `internal/usecase/interfaces.go:152`; `go build ./...` and `go vet ./...` now pass (the `log.Printf` vet finding in `article_usecase.go:101` was also fixed).

### Security — critical
2. ~~**Hardcoded Telegram bot token**~~ **FIXED 2026-09-23 (code side)** — `router.go` now reads `TELEGRAM_BOT_TOKEN` from env (bot gracefully disables if unset/invalid). The old committed token was **already revoked by Telegram** ("Unauthorized" at `getMe`); ⚠️ a fresh token from @BotFather must be added to `backend/.env`, and git history still contains the old one.
3. ~~**Hardcoded JWT secret**~~ **FIXED 2026-09-23** — `JWT_SECRET` env var, injected into `AdminHandler`; a random secret was generated locally. All issued tokens must be re-minted (logins invalidated).
4. ~~**Password auth bypass**~~ **FIXED 2026-09-23** — `admin_usecase.SignIn` now verifies the password (bcrypt, with transparent upgrade of legacy plaintext records on successful login). Smoke-tested 200/401.
5. ~~**Plaintext passwords stored & leaked**~~ **FIXED 2026-09-23 (storage & leak parts)** — `AddAdmin`/`UpdateAdmin` hash with bcrypt; `domain.Admin.Password` is `json:"-"` so responses no longer leak it (`GET /api/admin/` verified). ⚠️ Remaining: `POST /api/admin/register` is still unauthenticated (see #6), and legacy rows keep their plaintext password until that admin logs in once.
6. **Entire API unauthenticated** — CORS is the only global middleware (`router.go:110`); all admin/CRUD/delete routes are public, including `GET /api/student/` (full PII: phone, name, Telegram IDs) and image delete.
7. **Payments self-approvable** — `payment_handler.go:59,85`: `status` comes straight from the client form.
8. ~~**Premium bypass**~~ **FIXED 2026-09-23** — one shared enrichment rule for both getters: `IsPremium` only from **Approved** payments unexpired in UTC (was: any unexpired payment via `GetStudentByTelegramID`, mixed `time.Local`/UTC); a payment-lookup failure is now logged and treated as "no payments" instead of failing the student lookup, which is what made `DELETE /api/student/:id` 500 (client issue #1). Regression tests in `student_usecase_test.go`.
9. **Telegram webhook unverified** — `telegram_handler.go:21-33`: no `X-Telegram-Bot-Api-Secret-Token` check; spoofable.
10. ~~**CORS + credentials over-permissive**~~ **FIXED 2026-09-23** — `gin-contrib/cors` replaced by a hand-rolled middleware: `CORS_ALLOWED_ORIGINS` (comma-separated exact origins) is required in production; with it unset only `localhost`/`127.0.0.1` (any port) are allowed, and `*.devtunnels.ms` is **never** allowed. Allowed origin is echoed (never `*`) with `Vary: Origin`; 19-case table test in `router_test.go`. ⚠️ Ops: set `CORS_ALLOWED_ORIGINS=https://victory-contest.vercel.app,https://victory-admin-page.vercel.app` in prod env before deploy.
11. **Correct answers exposed to students** — `GET /api/question/` and contest hydration (`contest_usecase.go:57-79`) return `answer` + `explanation` for every question.

### Logic bugs / races
12. **Client-computed scores trusted** — `submission_handler.go:32-45`, `submission_usecase.go:315-326`: no server-side grading; leaderboard/achievements trivially cheatable.
13. ~~`CreatePayment` always 400s~~ **NOT A BUG (verified 2026-09-23)** — smoke test: a real multipart `POST /api/payment/` with all fields succeeded end-to-end (Cloudinary upload + DynamoDB write, HTTP 200). Go's `Request.PostFormValue` does parse multipart bodies on first access, so the field-read order in `payment_handler.go:56-64` is safe — though fragile and worth switching to `c.PostForm`/`c.GetRawPostForm` for clarity.
14. ~~**Double response write** — `payment_handler.go:92-95`: missing `return` after 500; then writes 200.~~ **FIXED 2026-09-23** — missing `return` after the 500 in `CreatePayment` (also: client-supplied `status` is now ignored — server always stores Pending; see commit d2c1fa4).
15. ~~**Same missing-return** — `question_handler.go:111-115` (500 then empty 200).~~ **FIXED 2026-09-23** — the missing `return` landed with commit 0c28bcd; `AddMultipleQuestions` now also writes a real 200 JSON body instead of an empty one. Verified: the >25-question batch path emits a single 500, happy path a single 200.
16. ~~**Payment expiration contradiction** — handler sets +3 days (`payment_handler.go:79,88`), usecase overwrites to +1 month (`payment_usecase.go:39`); handler value dead.~~ **FIXED 2026-09-23** — `AddPayment` (usecase) is the single authoritative rule: expiration = created_at + 1 month; the dead +3-days handler computation is deleted.
17. ~~**Webhook nil-pointer panic** — `telegram_usecase.go:36-39`: `update.Message.Chat` dereferenced unchecked; any non-message update panics. `HandleStartCommand` ignores `userId` (`:18`).~~ **FIXED 2026-09-23** — `TakeUpdate` nil-guards Message/Chat/From and acks non-message updates; `HandleStartCommand` now looks up the student by `telegram_id` (registering on first `/start`, idempotent) via the injected `StudentRepository`. Covered by `telegram_usecase_test.go`.
18. ~~**Badge duplication / lost updates** — `submission_usecase.go:556-568`: `already` map never consulted → duplicate badge IDs every submission; `defer` at `:327` runs **before** insert-error check; student `PutItem` at `:645` is unconditional read-modify-write (clobbers concurrent profile edits).~~ **FIXED 2026-09-23** — `evaluateAndAwardBadges` split into pure `earnedBadgeIDs` + deduping `mergeNewBadges` (the `already` set is now consulted); badge/profile writes run only after a successful submission insert; the student write is conditional (`attribute_exists(id)`) with one re-read+retry via new `UpdateStudentIfExist`/`ErrConditionalCheckFailed`. Covered by `TestMergeNewBadges_NoDuplicatesAcrossSubmissions`.
19. ~~**`GetAllPayments` hardcoded debug key** — `payment_dynamo.go:35-42`: range value `":user_id" = "112pay"` → returns nothing meaningful.~~ **FIXED 2026-09-23** — `ListAll` queries the user GSI on the partition key only (`GSI1PK = "PAYMENT_REQUEST"`), returning all payments; `GET /api/payment/` also honors `?user_id=`. Covered by `dynamo_local_test.go` (dynalite-gated).
20. ~~**Guaranteed-runtime-error Queries** — `student_dynamo.go:150-182`: `Query` with FilterExpression and **no KeyConditionExpression** → ValidationException; `GET /api/student/paid` and `VerifyStudentPaid` always 500 (also filters on a nonexistent `paid` attribute).~~ **FIXED 2026-09-23** — both converted to Scan filtered on the real `is_premium` attribute (student table defines no GSIs); `GET /api/student/paid` verified 200 with correct premium-only output. Covered by `dynamo_local_test.go`.
21. ~~**Index-out-of-range panic**~~ **FIXED 2026-09-23** — `admin_dynamo.go` `GetAdminByEmail` now checks `len(Items) == 0` (was `Items == nil` then read `Items[0]`); verified by login smoke test.
22. ~~**`GET /api/admin/:id` queries by email** — `admin_handler.go:101-108` passes the URL id to `GetAdminByEmail`.~~ **FIXED 2026-09-23** — route now calls `GetAdminByID` and returns 404 for unknown ids; covered by `admin_handler_test.go`.
23. ~~**Leaderboard "all" timeframe ≈ 1 year** — `submission_usecase.go:395-396`: `now.AddDate(-1,0,1)`.~~ **FIXED 2026-09-23** — `"all"` now uses the zero time, so every submission counts regardless of age; covered by `TestCalculateStartTime_AllIsAllTime`.
24. ~~**Contest rank tie-break inverted + string compare** — `submission_usecase.go:371-377`: slower `"HH:MM:SS"` sorts first; lexicographic comparison breaks.~~ **FIXED 2026-09-23** — ties now compare `ParseTimeSpend` seconds ascending — faster wins; covered by `TestGetRankingsForContest_TieBreakFasterWins`.
25. ~~**Global leaderboard tie-break no-op** — `:439-444`: sorts by `TimeTaken` before it's formatted (`:452`).~~ **FIXED 2026-09-23** — `sortAndRank` sorts on `TimeTakenSeconds` before formatting; covered by `TestSortAndRank_TieBreakByFasterSeconds`.
26. ~~**Average-time divides by questions, not contests** — `submission_usecase.go:211`.~~ **FIXED 2026-09-23** — average time = total time / contest count (guarded); accuracy still per question; covered by `TestGetStudentProfileStatistics_AvgTimePerContest`.
27. **Contest PATCH ignores new question lists** — `contest_handler.go:78-88,144-150` (only prevents clearing); non-string JSON silently dropped (`:94`).
28. ~~**Wrong broadcast on registration** — `student_handler.go:49-57`: new students trigger "Feadback questions are added…" to everyone; feedback-response notification addressed to the student themselves (`feedback_handler.go:257`).~~ **FIXED 2026-09-23** — the bogus global broadcast on student registration is removed; the feedback-response notification now goes to the `admin` audience instead of the submitting student. Covered by `student_handler`/`feedback_handler` tests.
29. ~~**`GET /api/notification/` dead** — handler reads `:recipient_id` that isn't in the route (`notification_handler.go:24,100-101`).~~ **FIXED 2026-09-23** — `GET /api/notification/` now wired to `GetAllNotifications`; `PATCH /:id` alias added for the frontend mark-read call (commit 0c28bcd).
30. ~~**Nil deref in `MarkNotificationAsRead`** — `notification_usecase.go:71-83` no nil check.~~ **FIXED 2026-09-23** — nil guard + 404 mapping landed with commit 0c28bcd; now pinned by `notification_usecase_test.go` (unknown id → clean 404, no panic).
31. ~~**Duplicate students + whole-item overwrite** — `student_dynamo.go:35-71`: `PutItem` without `telegram_id` uniqueness check; `UpdateStudent` PutItem wipes stale fields.~~ **FIXED 2026-09-23** — `AddStudent` pre-reads by `telegram_id` and returns new `ErrStudentAlreadyExists` (handler maps to 409); the residual check-then-put race is documented in code (no GSI exists on `telegram_id`). `UpdateStudent` now uses `UpdateItem` SET-ing only non-zero fields + `updated_at` stamp, so stale reads can't wipe fresh attributes; trade-off: fields can no longer be *cleared* through PUT (only overwritten). Covered by `student_issue31_test.go`.
32. ~~**Registration double-entry race** — `contest_registration_usecase.go:31-42`: check-then-set with ignored update error (`:40`); handler maps all errors to 409 (`contest_registration_handler.go:78-86`).~~ **FIXED 2026-09-23** — activation errors are propagated (never a silent 200), the write is conditional via new `UpdateContestRegistrationIfExist` (`attribute_exists(id)`, same recipe as `UpdateStudentIfExist`) with re-read + retry (2 attempts); sentinels `ErrAlreadyRegisteredForContest`/`ErrNotRegisteredForContest` map to 409/404 while real failures now return 500 (was: everything 409). `AddContestRegistration` rejects duplicate (contest, student) pairs. Residual: a concurrent *duplicate POST* race remains possible (row key is a random id, not contest+student). Covered by `contest_registration_usecase_test.go` + dynalite tests.
33. ~~**`DeleteContactByPhoneNumber` clears only first match** — `feedback_response_dynamo.go:223-241` (`return` inside loop) + PutItem lost-update.~~ **FIXED 2026-09-23** — sweeps ALL matching responses with a targeted `UpdateItem REMOVE contact_info` conditioned on the stored phone still matching (no clobber/resurrection); per-item errors collected, first returned. Verified: 2 responses sharing a phone → both cleared, other attributes intact.
34. ~~**Comment counter incremented on wrong ID** — `article_usecase.go:95-104`: passes comment ID instead of `ArticleID`; UpdateItem also **creates phantom items**.~~ **FIXED 2026-09-23** — increment now targets `comment.ArticleID` with `attribute_exists(id)` condition; non-existent articles return 404 instead of creating phantom items.
35. **AI error-handling order** — `ai_usecase.go:55-67`: API error checked only after JSON slicing → misleading "could not find JSON object"; prose containing `[` mis-slices.
36. ~~**Negative-slice panic** — `article_handler.go:54-57`: `?number=-1` → `items[:n]` panic.~~ **FIXED 2026-09-23** — `ListPublished` clamps `n <= 0` (and `n > len`) — no negative-slice panic; returns `[]` not nil.
37. ~~**Fake dashboard numbers**~~ **FIXED 2026-09-23** — registrations now count real `ContestRegistration` rows (by `RegisteredAt`); revenue sums `PaymentRequest.Amount` on approved payments (new optional `amount` attribute, ETB — old placeholder `$` label dropped). ⚠️ Follow-up: `POST /api/payment/` doesn't accept `amount` yet, so new rows carry 0 until the payment-create slice wires it; legacy rows without the attribute count 0.
38. ~~**Contest status time-format inconsistency**~~ **FIXED 2026-09-23** — one shared `parseContestTime` (RFC3339 + legacy layouts) used by status distribution, contest trend, and recent activity; unparseable schedules are uniformly classified "upcoming" / shown "N/A" instead of being silently dropped or dated "now".
39. **`AnnounceContest` discards its payload** — `contest_handler.go:226-246`.
40. **`Submission.Error() { panic(...) }`** — `domain/submission.go:20-22`: implements `error` as a landmine.

### Data access / hygiene
41. **No `LastEvaluatedKey` pagination in any Scan/Query** — e.g. `contest_dynamo.go:53-66`, `student_dynamo.go:121-134`, `pageview_dynamo.go:56-80`, `feedback_response_dynamo.go:139-152`.
42. **Questions attribute written as `SS` on update but `L` on insert** — `contest_dynamo.go:136-139`.
43. ~~**Stray `reason` attribute** on payment status updates — `payment_dynamo.go:119-141`.~~ **FIXED 2026-09-23** — `UpdateStatus` no longer writes `reason`; legacy items fold `reason` into `rejection_reason` at read time via `normalizeReasons` and never write it back.
44. ~~**No table/GSI provisioning code**~~ **PARTIALLY FIXED 2026-09-23** — `cmd/setup-tables/main.go` creates all 16 tables (incl. `banks`) and every GSI the code queries (idempotent; used against dynalite for local e2e). Prod still needs real IaC.
45. **16 independent AWS SDK clients** — `router.go:43-59`.
46. **`context.TODO()` everywhere** — no timeouts/cancellation.
47. **Typos**: `pyament.go`, `NewImageRepostory` (`image_repo.go:18`), table `contest_registeration` (`router.go:50`), "Feadback" (`student_handler.go:51`, `feedback_handler.go:51`), `GetStudentStatisctis` (`submission_handler.go:29`), "recepientId"/"reciepientId" (`student_handler.go:53`, `feedback_handler.go:257`), module `victor-contest-go`.
48. **Debug leftovers**: `fmt.Printf` `%+v` dumps in `student_handler.go:185-218` and `question_handler.go:119-195`; `GET /feedback-response/test` (`feedback_handler.go:237,361-363`); `GetSubmissionByID` special-cases `id=="leaderboard"` (`submission_usecase.go:336-341`); stub endpoints returning `nil,nil` (`student_dynamo.go:255-263`); custom `min()` shadowing builtin (`question_dynamo.go:17-22`); commented-out code (`telegram_usecase.go:60-63`).
49. **Dead code**: `cmd/app/main.go`; `ContestStatisticsRepository` (nil); achievement CRUD; `ContestInput/ToDomain` (`contest_usecase.go:8-23`); `PaymentReason` (`pyament.go:27-29`); `ContestAnnouncementRequest` (`contest.go:17-19`); `ListByArticleIDScan` fallback (`comment_dynamo.go:78-99`); unused `cloudinaryurl` field (`image_repo.go:16`).
50. **No input validation** — no bound `binding:` tags; `Answer` not range-checked (`question_handler.go:44-50`); contest times free-form; student IDs taken from client bodies; **no file type/size limits** on multipart uploads (`question_handler.go:52-72`, `payment_handler.go:66-78`, `image_handler.go:25-44`).
51. **`log.Printf(err.Error())`** non-constant format — `article_usecase.go:101`.
52. **Fire-and-forget goroutines discarding errors** — `student_handler.go:49-57`, `feedback_handler.go:50-57,253-260`.

## 10. Recommendations

**Immediate**
1. Fix `interfaces.go:150-157`; add `go build ./... && go vet ./...` CI gate.
2. ~~Rotate the Telegram bot token and JWT secret; move both to env~~ **DONE 2026-09-23 (code side)** — both now env-driven; old token already revoked externally, old secret retired; git history still contains both.
3. ~~Repair always-failing paths: #19 (GetAllPayments), #20 (Query without key condition), #21 (panic), #14/#15 (double writes)~~ — all fixed 2026-09-23.

**Security**
4. Auth middleware: verify Telegram `initData` HMAC for student routes; shared JWT middleware for admin/CRUD; RBAC split.
5. bcrypt/argon2 admin passwords; strip from JSON; implement password comparison; gate `POST /admin/register`; honor `IsApproved`.
6. Server-side scoring: accept `question_id → selected` answers, grade against stored answers; never expose answers before contest close.
7. ~~Explicit CORS allowlist; drop wildcard localhost/devtunnels when using credentials~~ **FIXED 2026-09-23** (see #10).
8. Telegram webhook secret token; rate-limit `/api/ai/*` and `/api/payment/update`.

**Architecture / data**
9. Env-driven region/table names (as `.env.example` promises); one shared `dynamodb.Client`; propagate request contexts; paginate every Scan/Query.
10. GSIs or single-table design for Scan+Filter hot paths; consistent `time.Time`/RFC3339, one timezone policy.
11. Conditional writes (`attribute_not_exists`, version attrs) for badge/registration/feedback read-modify-writes.
12. Decide fate of dead code (§9 #49): delete or wire.

**Engineering**
13. Tests: usecase unit tests with repo mocks (premium logic, leaderboard sorting, statistics buckets), handler table tests, DynamoDB Local integration harness.
14. Central error/response helper (proper 400/404/409); structured `slog` logging replacing `fmt.Printf`; stop echoing internal errors.
15. Ops: health endpoint, graceful shutdown, request IDs/metrics, CI (build/vet/test/golangci-lint), Dockerfile, IaC for the 15 tables + GSIs, real dashboard revenue.
16. Paginate all whole-table list endpoints.
