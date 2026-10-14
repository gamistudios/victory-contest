# Victory Contest / Academy

Monorepo: Go + DynamoDB backend, student app (Telegram Mini App, React/Vite), admin app (React/Vite).

| Folder | What |
|---|---|
| `backend/` | Gin API (`main.go`, `internal/{domain,usecase,repository,handler/http,schema}`), migration commands in `cmd/` |
| `frontend/` | Student app (`src/pages`, `src/academy`, `src/shared/{scope,pricing}`) |
| `admin-page-clean/` | Admin app (`src/pages`, `src/components`, `src/services`) |
| `docs/` | `ARCHITECTURE.md`, `DOCKER.md`, `DEPLOYMENT.md` |

## Run

```bash
cd backend && cp .env.example .env && go run .     # tables are created on boot
cd frontend && npm i && npm run dev
cd admin-page-clean && npm i && npm run dev
cd backend && go build ./... && go vet ./... && go test ./...
```

## Auth

Students use a session token (Telegram init data); admins use a cookie. Per-student routes require the student's own token or an admin. Premium content is enforced on the server (contests: 401/402; academy and AI follow entitlements).

## Migrations

Two layers run automatically on every boot (`NewServer`):

1. **Schema** (`internal/schema.EnsureTables`): missing tables and GSIs are created.
2. **Data** (`internal/migrations`): every pending migration runs once, in id order, after the schema and the program seed. Applied ones are recorded in the `schema_migrations` table, so a new deployment runs only what is new. A failing migration is logged, stops the later ones and is retried on the next boot (the API still starts). A lock row keeps two instances from running the same one.

Migration ids look like `YYYYMMDD-NNN-name` (`20261014-001-grade-9-12`). To add one, append to `migrations.Registry()` with a larger id; never edit or renumber a shipped one, and keep it idempotent.

| id | What it does |
|---|---|
| `20261014-001-grade-9-12` | student grade `1-4` -> `9-12` |
| `20261014-002-student-enrollments` | legacy students get a `grade-<n>` enrollment (grades 11/12 -> `natural`, 9/10 -> `common`) |
| `20261014-003-seed-locations` | store the region/city seed in `reference_data` (never overwrites) |
| `20261014-004-default-price-plan` | seed an "All access" plan **only when `MIGRATE_PRICING_ETB` is set** (whole ETB birr; otherwise deferred, not recorded) |

Environment: `AUTO_MIGRATE=off` disables the runner; `MIGRATE_PRICING_ETB` (and optional `MIGRATE_PRICING_DAYS`, default 30) seeds the default plan; `MIGRATION_BACKUP_DIR` (default `migration-backups`) receives the JSON backup written before a data migration changes rows. The container disk is usually ephemeral: mount a volume there if you want to keep the backups.

By hand (dry-run by default): `go run ./cmd/migrate -status` lists applied/pending, `go run ./cmd/migrate` runs the pending ones, and `cmd/migrate-{grade,enrollments,locations,pricing}` are thin dry-run wrappers over the same functions (`-apply` to write). `cmd/migrate-answer-index` is NOT automatic: it needs a prod dry-run review first.

See `PROGRESS.md` for status and `PROPOSED-IMPLEMENTATION-PLAN.md` for the roadmap.
