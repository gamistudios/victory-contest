# PROGRESS.md — Phase 0 & 1: current state and handoff reference

Date: 2026-10-14. Plan: `PROPOSED-IMPLEMENTATION-PLAN.md` (revision 4). Client constraints and decisions: `discussion.txt` (untracked; summarized below).

This file replaces the earlier twelve append-only pass logs, which contradicted each other ("not compiled" notes written before the tree was actually built). Everything here reflects the tree as of commit `5e6785c` and is verified by the gates in the last section.

**Who this is for:** a second AI agent continuing development. Sections "Development methods and style" and "Client decisions (discussion.txt)" are the contract — follow them.

## 1. Status

Phase 0 and Phase 1 are **complete and verified locally**. Nothing is in a half-wired state. Remaining work is quality (tests) and Phase 2 (content scoping), both explicitly deferred by the client.

Commits in this verification + hardening arc (all on `main`, pushed together):

| Commit | What |
|---|---|
| `f22a5ba`, `b528f2b` | Phase 0/1 implementation (the original two unpushed commits) |
| `d2002f9` | Compile fixes (`ErrStudentNotFound` duplicate) + gofmt, 23 files |
| `3b3570f` | Admin Programs page tsc fix |
| `4cf4cb3` | Frontend defects: free-order screenshot block, 402 raw toast, unreachable Payment success screen |
| `496653f` | Backend defects: dead amount-mismatch guard, fixed_end/AdminGrant expiry, location free-text validation, revoked/lifetime premium reads |
| `ca38197` | Admin services called non-`/api` paths (404) — pricing/enrollment/locations fixed, all other admin services swept |
| `cc856ae` | Docs: twelfth-pass gate record |
| `0a09ea3` | Transitional compat shims so a backend-first deploy doesn't break the currently deployed old frontend |
| `dc34cbc` | Docs: the four new boot-migration env variables in both `.env.example`s |
| `5e6785c` | Money-unit refactor: all amounts are whole ETB birr (see §3) |

## 2. What was built (map)

**Phase 0 (bug fixes):** D1 grade `"1".."4"` → `9..12` (registration form, server validation, `migrate-grade`); D5 IDOR closed on editorial/statistics/registration routes (`studentOwnerOrAdminAuth`, token id must match path id); D6 no more full-question scans (`QuestionDynamoRepository.GetByIDs` batched); D4 one submission per (contest, student) — deterministic id + `attribute_not_exists`, returns 409 `already_submitted`; D13 docs consolidated into README + `docs/`.

**Phase 1 (taxonomy, enrollment, access, pricing):**

| Layer | Files | Key facts |
|---|---|---|
| Domain | `domain/{scope,locations,pricing,grade,student,pyament,contest,question,academy}.go` | Programs are data (`Kind`, `Group`, `Features`, `Grade`, `SortOrder`, `OpenForRegistration`); `Scope` on contests and questions; payments carry `plan_id/coupon_code/currency/final_amount/program_ids/validity/revoked` |
| Pure rules | `usecase/{pricing_logic,access,catalog}.go` + tests | Sale window (inclusive) → coupon → clamp; percent rounds half-up; 100% coupon ⇒ `Free` (auto-approved, no proof). `Decide` = single access function with the plan §5.3 rule order + 3-day grace + `LockFor` lock object. `RebuildEntitlements` is idempotent: early renewal extends, `fixed_end` takes the later end, `lifetime` never expires |
| Persistence | `repository/{pricing_dynamo,reference_data_dynamo,payment_dynamo}.go` | Coupon `Redeem` is an atomic conditional counter; `Release` gives the use back on first reject/delete (revoke keeps it consumed); entitlements via `student_id-index` |
| Usecases | `usecase/{pricing_usecase,enrollment_usecase,payment_usecase}.go` | `Snapshot` re-derives everything server-side and **leaves `p.Amount` as the student-reported figure** (that's what the approval mismatch check compares); approve/reject/delete/revoke rebuild entitlements; legacy approved payments become all-programs `fixed_end` grants |
| Routes | `handler/http/{pricing,enrollment,payment,contest,catalog,...}_handler.go`, `router.go` | Public `GET /api/pricing`, `GET /api/catalog` (ETag); student `POST /api/pricing/quote`, `GET /api/me/entitlements`, enrollment CRUD; admin `/api/pricing-admin/*`, `/api/enrollment-admin/*`, `/api/locations-admin/*` (+ free-text promote), academy program admin + move-subject |
| Migrations | `internal/migrations/*`, `cmd/migrate*` | See §4 |
| Student app | `shared/{scope,pricing}/*`, `Payment.tsx`, `PremiumSheet.tsx`, `StudentRegisteration.tsx` (3 steps), `MyPrograms.tsx` | Plans + coupon + server quote in the paywall and payment page; free quote ⇒ no screenshot; 402 opens the shared premium sheet |
| Admin app | `pages/{Pricing,Locations,BulkEnrolment}.tsx`, `academy/admin/Programs.tsx`, `users/UserAccessSheet.tsx`, `common/ScopePicker.tsx`, question/contest scope UIs | Catalog-driven filters; grant/revoke/rebuild per student; revoke in approved payments; approval shows expected-vs-reported (409 confirm + `?force=true`) |

Gates closed: premium contests (`GET /api/contest/:id` → 401/402 + `lock`), per-program academy locks, AI gate (primary program's `ai_tutor` feature AND entitlement), question scope stored + filterable (`GET /api/question/?program_id=...&scoped=none`).

**Deliberately not done:** Telegram Stars (client will drop it — leave alone), question scope in contest assembly / student question matching (Phase 2), coupon redemption export, catalog service extraction from `AcademyUsecase`, per-student coupon limit beyond one process (mutex today; needs a conditional write if 2+ instances).

## 3. Money unit: whole ETB birr, integers end to end

There is **no sub-birr unit anywhere** (the 1/100-birr sub-unit was removed in `5e6785c` per the client: whole birr only). `Money.Amount` (int64), `Quote.{price,discount,final}`, `PaymentRequest.FinalAmount`, `MIGRATE_PRICING_ETB`, admin inputs, and both frontends all speak **integer ETB**. A percent discount rounds to the nearest whole birr server-side. `PaymentAmountMismatch` compares reported vs server price with no unit conversion.

Safe without a data migration: `price_plans`/`coupons`/`entitlements`/`reference_data` do not exist in production yet (first boot creates them), and legacy payment rows have no plan fields (`Amount` was always float ETB).

**Rule for future work:** never introduce decimal money or a sub-unit; keep amounts int64 whole birr and round server-side with half-up (`d = (price*pct + 50) / 100`).

## 4. Automatic versioned migrations

Data migrations run **on boot**, ordered by ID `YYYYMMDD-NNN-name`, recorded in `schema_migrations` (ledger row: id, description, summary, applied_at, status). Details: `internal/migrations/{runner,registry}.go`, boot hook in `router.go` after `EnsureTables` + program seed, 20 min timeout, `lock#<id>` row (15 min TTL) so two instances don't double-run.

Shipped: `-001` grade 9-12, `-002` enrollments backfill (grades 11/12 → stream `natural`, 9/10 → `common`, written `confirmed=false`), `-003` seed locations, `-004` default "All access" plan.

Behavior: applied ones are skipped; a failure is not recorded, blocks later ones, and retries next boot (API still boots). Each data migration writes a JSON backup to `MIGRATION_BACKUP_DIR` **before** touching rows and refuses to write if the backup fails. `cmd/migrate-{grade,enrollments,locations,pricing}` are thin dry-run wrappers over the same functions; `go run ./cmd/migrate -status` shows the ledger. `migrate-answer-index` is deliberately NOT automatic (needs prod dry-run review).

**`-004` is deferred until `MIGRATE_PRICING_ETB` is set** (whole ETB, e.g. `299`) — no price is ever invented. Adding a migration: append to `migrations.Registry()` with a larger ID; never edit or reorder shipped IDs.

## 5. Environment variables the operator must set (audit result)

Phase 0/1 introduced **four new variables**. None existed before; all are now documented in both `.env.example` and `backend/.env.example` (`dc34cbc`). They are all optional — the app boots correctly with none of them set:

| Variable | Default | What to decide |
|---|---|---|
| `AUTO_MIGRATE` | on (anything except `off`/`false`/`0`) | **The one real decision.** With it on, the first boot against a database rewrites student grades (`"1".."4"` → `9..12`) and backfills enrollments. A test server pointing at production DynamoDB tables mutates production data — set `AUTO_MIGRATE=off` on any instance that shares prod tables until the changes are intended |
| `MIGRATE_PRICING_ETB` | unset → `-004` stays deferred | Set it (whole birr, e.g. `299`) on the deployment that should seed the default plan, or create plans in the admin Pricing page instead. `/api/pricing` is empty until one of these happens |
| `MIGRATE_PRICING_DAYS` | `30` | Validity of the seeded plan |
| `MIGRATION_BACKUP_DIR` | `migration-backups/` | JSON backups land on the container disk; mount a volume if you want to keep them |

No existing variable changed meaning. `MIGRATE_PRICING_ETB` means whole ETB birr as of `5e6785c` (it briefly meant 1/100-birr units).

## 6. Deploy compatibility: shims and ordering

Verified skew matrix for a mixed old/new deployment:

- **Old frontend/admin + new backend: safe.** Two transitional shims (commit `0a09ea3`) protect it: `GET /api/contest-registration/isActive/:contest_id/:student_id` is aliased to the guarded POST handler (the deployed frontend still GETs), and `AddStudent`/`UpdateStudent` map legacy grade `"1".."4"` to `9..12` at request time. Both are marked TRANSITIONAL in code; remove them only after no old client is live.
- **New frontend + old backend: broken** — `/api/catalog` and `/api/pricing*` 404, the 3-step registration posts fields the old server ignores. **Not fixable from code.** `frontend/vercel.json` means a push may auto-deploy the student app while the backend is still old: deploy the **backend first**, then the frontends. The admin app only calls new endpoints on new pages, so it can go anytime after the backend.
- Migrations run on the backend's first boot against whatever DynamoDB that instance's credentials point to — see §5 warning.

QA-visible behaviour changes (both directions of the client's plan): second submission to a contest → 409 with an "Already submitted" toast; premium contest without access → 402 opens the shared premium sheet (was a raw error); free-coupon orders no longer demand a screenshot; payment admin approving a wrong-amount plan payment gets a 409 mismatch confirm; invalid grade updates return 400 (after `-001` runs, this only affects hand-written bad rows).

## 7. Development methods and style (continue similarly)

1. **Spec prompts are contracts.** The client pastes implementation prompts listing every constraint and exact code; implement literally, verify each numbered item, don't redesign.
2. **Pure logic first, wired second.** Pricing/access/scope/enrollment rules live in `usecase/pricing_logic.go`-style files with no I/O and table tests; repositories and handlers call into them.
3. **Never invent product values.** Prices, bot names, domains come from flags/env/the running server, never hardcoded guesses ("no price is invented" is the client's standing rule).
4. **Server is the source of truth.** Client-sent amounts/plans/validity are ignored and re-derived (`Snapshot`); the client-reported figure is kept only for the mismatch check.
5. **Data migrations: dry-run default, JSON backup before any write, conditional updates, idempotent.** Boot automation runs them in numbered order (§4).
6. **Don't break the deployed client.** Additive changes; when a route/contract must change, ship a transitional shim and say so in the commit message.
7. **Verify gates from output, not intention.** `cd backend && go build ./... && go vet ./... && go test ./...`; for each app `npx tsc -b --force` then `npx vite build`. Read exit codes from direct runs (a pipeline's `$?` is the tail's).
8. **Commit each unit** with conventional commits (`fix(backend):`, `refactor(pricing):`, `docs(env):`), body focused on why. Keep `discussion.txt` and `Python/` untracked.
9. **UI: match the existing theme** (client requirement) — admin academy kit (`Panel`, `Field`, `Chip`, `FormSheet`, `ConfirmDialog`), student app tokens (`blue-fix-600`, `rounded-2xl`); compact density; no persuasive copy.
10. **Prod safety:** never run writes/deletes against live services (DynamoDB, Cloudinary, Telegram) without explicit per-action approval; `backend/.env` is local test config, prod creds live in the repo-root `.env`.

## 8. Client decisions (discussion.txt summary)

`discussion.txt` is the raw client conversation that produced Phase 0/1; it stays untracked. Its decisions, condensed:

- **Speed boxes:** work in hard 15-min/5-min passes, each ending with an updated PROGRESS.md and a zip. Honesty about what is NOT done was explicitly demanded.
- **No invented values:** the pricing seed price comes from `-etb`/env only.
- **Auto-migrations on deploy:** "run on the first deployment… automatically execute… by date/numbering" — that request created §4.
- **Telegram Stars:** "Ignore… it might/will be dropped off the system" — leave Stars untouched, keep the wording/fields out of new UI.
- **UI:** must match the existing theme (the old registration form was called out as the wrong style).
- **Compilation:** the client first insisted they'd compile locally; later local passes actually ran the gates — keep running them (§7 item 7), that's now the accepted practice.
- **Tests:** "We'll do the test next" — deferred, not skipped forever. The pending list is §9.
- Money: whole ETB birr only, no sub-unit (added in this arc; client-driven).

## 9. What's next (agreed backlog)

1. **Tests** (the agreed "next"): authorisation matrix, coupon race/release, per-program locks, move-subject cascade, rename propagation, promote location, AI gate + `ai_tutor`, question scope filter, payment amount mismatch, DynamoDB-Local repository and runner tests.
2. Phase 2: contest assembly + student question matching by `Question.Scope`; per-student coupon conditional write for 2+ instances; coupon export.
3. Cleanup once no old client is live: remove the `0a09ea3` shims, delete `Data.tsx` fallback lists, drop Telegram Stars end-to-end.

## 10. Verification runbook (last full run: green)

```bash
cd backend && go build ./... && go vet ./... && go test ./...   # all pass; usecase ~50s, migrations ~3s
cd frontend && npx tsc -b --force && npx vite build             # pass (build ~3m45s)
cd admin-page-clean && npx tsc -b --force && npx vite build     # pass (PWA precache generated)
```

Not covered locally: browser E2E against the running stack, anything DynamoDB-backed (unit tests use fakes), first-boot migration behaviour against a real (non-prod!) table set. Known cosmetic: `gofmt -l` still flags pre-existing academy files (6 of them pre-date this branch); money code is clean.

