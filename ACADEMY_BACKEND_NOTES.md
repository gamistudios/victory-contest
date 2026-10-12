# Victory Academy (Learn) – backend integration

## Mock layer removed (2 frontends)
- `frontend/src/services/academy/mock/` (deleted; `installAcademyMock` import + the
  `VITE_ACADEMY_MOCK` switch removed from `frontend/src/services/api.ts`)
- `admin-page-clean/src/services/academy/mock/` (deleted)

## New backend files
- `internal/domain/academy.go`
- `internal/repository/academy_dynamo.go`
- `internal/usecase/academy_usecase.go` (student side), `academy_admin.go`, `academy_ai.go`
- `internal/usecase/academy_seed.go` + `academy_seed.json` (data migration)
- `internal/handler/http/academy_handler.go`
- `internal/handler/http/academy_routes_test.go` (mounts every route on a bare gin engine:
  fails on a route collision or on a route that escapes the student/admin middleware chain)

## Edited backend files
- `router.go` (wiring + routes under `/api/academy`), `schema/tables.go` (2 new tables),
  `ai_usecase.go` (+`GenerateText`), `ai_handler_test.go` (fake updated)

## DB migration (automatic on boot, no manual step)
- Tables `academy_content` and `academy_students` are created by `schema.EnsureTables`
  (plain `id` partition key, same as every other table here).
- `SeedIfEmpty()` loads the catalogue (7 programs, 3 streams, 9 subjects, 20 chapters,
  33 modules) with `attribute_not_exists` writes; marker `meta#seed_v1` is written last.
  Never overwrites admin edits, and an interrupted run is retried on the next boot.
- Existing tables are untouched. Nothing has been run against any environment yet: this
  migration executes the first time the server boots with production AWS credentials.

## API (student = Bearer student JWT, /admin = admin cookie)
`GET`/`PATCH` /me, `PUT` /me/target, `GET` /dashboard, /programs, /subjects, /subjects/:id,
/modules/:id, `POST` /modules/:id/progress|complete, `POST` /referrals/claim,
`POST` /flashcard-reviews, `GET`/`POST` /quiz-attempts,
`POST` /ai/flashcards|quiz|tutor (rate-limited),
/admin/tree, /admin/modules[/:id][/duplicate|access|status|reorder], /admin/chapters,
/admin/subjects, /admin/programs/:id, /admin/ai/generate, /admin/ai-drafts, /admin/analytics

Client path prefixes follow each app's axios instance: the student app's baseURL already
ends in `/api` (`/academy/...`), the admin app's does not (`/api/academy/...`).

## Behaviour changes vs the mock
- Premium = real approved payment (same rule as the rest of the app). "Mock preview tools"
  and "Reset mock data" removed; the Upgrade page goes to the existing `/payment` route.
- Locked content is stripped server-side (`academyProtectModule`), not just hidden in the UI.
- Referral unlock: link is `t.me/<bot>?startapp=ref_<referrerId>_<moduleId>`; the friend's app
  claims it (once per account, no self-referral, referrer must exist). `<bot>` is read from
  `GET /telegram/bot`, which reports the username of the bot this process authenticated as
  (`tgbotapi` runs getMe while starting up), so the link can never name an account that does
  not open the mini app. `VITE_TELEGRAM_BOT_USERNAME` is only a fallback for when that call
  cannot be answered, and `src/components/article/ArticleView.tsx` uses the same source.
  Test the flow on a real device.
- AI (tutor, flashcards, quizzes, admin drafts) uses the configured AI provider; 503 if none,
  502 when a provider reply cannot be parsed.
- Analytics are computed from real student data (avg minutes uses the module's estimated time,
  because the app does not track time spent).
- Quiz scores, reading percentages and flashcard reviews are self-reported by the client, the
  same as the mock. Anything ranking-relevant should be re-validated server-side later.
