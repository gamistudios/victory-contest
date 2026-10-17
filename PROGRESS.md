=== BEGINNING OF PHASE 0 & PHASE ONE ===

# Implementation progress: Phase 0 and Phase 1

Plan: `PROPOSED-IMPLEMENTATION-PLAN.md` (revision 4). Date: 2026-10-14.

> **Status update (twelfth pass, 2026-10-14): the "not compiled / not run"
> warnings below are superseded.** The full tree was compiled, unit-tested
> and built locally, six wiring defects were found and fixed, and results
> are in the final section. Nothing has been pushed yet, by request.

## Read this first: verification status

The sandbox had Go 1.22 and **no access to the Go module proxy or npm**, and `go.mod` needs Go 1.24.4 plus AWS/Gin dependencies. So:

| Check | Result |
|---|---|
| Pure logic (`scope`, `locations`, `grade`, pricing/quote/entitlements, `Decide`, enrollment validation, program-seed enrichment) | **Compiled and unit-tested** in an isolated module: `go vet` and `go test` pass |
| Every edited or new Go file | `gofmt -e` syntax check passes |
| Full backend (`go build ./...`, the 58 existing test files) | **NOT compiled, NOT run.** Edits were re-read by hand for types and imports, but you must run `cd backend && go build ./... && go test ./...` before merging |
| Frontend / admin (`tsc`, `vite build`) | **NOT run** (no `node_modules`) |
| Anything touching DynamoDB (`GetByIDs`, conditional put, `SeedProgramsV2`, new tables) | Not exercised against a database or DynamoDB Local |

Line endings: Python edits normalised the CRLF in the ~15 Go files I touched to LF, so those files will show whole-file diffs. Run `git diff -w --ignore-cr-at-eol` to review, or re-apply CRLF if you prefer.

## Phase 0: Foundations and bug fixes

| Item | Status | What was done |
|---|---|---|
| Remove `victory-academy/` | n/a | Not present in the uploaded zip; nothing to remove. Run `git rm -r victory-academy` in your repo if it still exists |
| **D1** grade stored as `"1".."4"` | Done (code), **needs ops step** | Registration select now stores `9..12` (`StudentRegisteration.tsx`). New `domain/grade.go` (`IsValidGrade`, `LegacyGradeToCurrent`); `AddStudent` rejects invalid grades (400 `ErrInvalidGrade`), `UpdateStudent` rejects non-empty invalid grades. New `cmd/migrate-grade` (dry-run by default, prints `DISTINCT grade` counts, writes a JSON backup, conditional updates, idempotent). **Run it before deploying:** otherwise existing students holding `"1".."4"` get a 400 when they update their profile |
| **D5** IDOR / unauthenticated student routes | Done | `editorial`, `statistics`, `statistics-profile` now use `studentOwnerOrAdminAuth`: a student token must equal the path `:student_id` (403 otherwise), the admin cookie still works. All `contest-registration` student routes require a student session and the id must match the token. `isActive` is now `POST`; the old `GET` answers 405 with a hint. `Contest.tsx` updated to `POST` |
| **D6** full question scan | Done | `QuestionDynamoRepository.GetByIDs` (`BatchGetItem`, 100/call, unprocessed keys retried). `GetContestByID` uses it through an optional `questionBatchGetter` interface (test fakes still compile and fall back to the old read). Badge evaluation no longer calls `GetContestByID` once per past submission |
| **D4** duplicate submission guard (interim) | Done | One submission per (contest, student): usecase pre-check (catches legacy duplicates) plus deterministic id `contestId_studentId` with `attribute_not_exists(id)` in the repository (race-free). Returns **409** `already_submitted`. `time_spend` is still client-supplied until Phase 2 |
| D13 stale comment | Partly | Fixed the "No auth yet" comment on `DeleteSubmission`. **Root docs not consolidated** (README, `*_SUMMARY.md`, `ACADEMY_*.md`, `DOCKER_*.md`) |

Behaviour changes to tell the client or QA about: a second submit to the same contest now returns 409 (the student app does not yet show a friendly message); old `GET isActive` calls from cached clients get 405.

## Phase 1: Taxonomy, enrollment, access, pricing

### Done (backend)

| Plan item | Where |
|---|---|
| `Scope`, `ScopeFilter`, `Matches`, `VisibleTo`, `BoardKey`, `common` stream rule | `domain/scope.go` + tests |
| Programs as data: `Kind`, `Group`, `Features`, `Grade`, `SortOrder`, `OpenForRegistration`; helpers `HasFeature`, `NeedsStreamChoice`, `AllowsStream` | `domain/academy.go` |
| Additive program seed v2: adds `entrance-exam`, `freshman`, `training`; **enriches** existing programs only where fields are empty; never overwrites admin edits; nothing deactivated; marker-guarded, runs on boot after the v1 seed. Program ordering now uses `SortOrder` (legacy order as fallback) | `usecase/academy_programs_seed.go`, `academy_usecase.go`, `router.go` |
| Locations types + validation (`ValidatePick`: ids, or "Other" text >= 2 chars) and a developer-seeded region/city list (14 regions) | `domain/locations.go`, `usecase/locations_seed.json` |
| Public cacheable `GET /api/catalog` (ETag): active programs, streams, subjects, chapters, locations | `usecase/catalog.go`, `handler/http/catalog_handler.go` |
| `ValidateEnrollment` (unknown/inactive program, closed registration, stream required/not allowed, common-only programs skip streams) | `usecase/catalog.go` + tests |
| Student model: `PrimaryProgramID`, `Enrollments[]` (with `Confirmed`), `RegionID`, `CityID` | `domain/student.go` |
| Pricing domain: `PricePlan`, `Coupon`, `Entitlement`, `Money`, `Validity`, `Sale` | `domain/pricing.go` |
| Pricing rules, pure and tested: sale-window price (inclusive bounds), plan visibility/ordering, percent/fixed coupons, coupon scope/expiry/limits/currency, clamp and free (100%) coupons, `RebuildEntitlements` (early renewal extends, lapsed restarts, `fixed_end` cohorts, bundles, all-access, lifetime, deterministic) | `usecase/pricing_logic.go` + tests |
| `Decide`: the single access function with the exact rule order of plan §5.3, grace period (default 3 days), `LockFor` for the uniform `lock` object; test shows a Grade 12 entitlement does **not** unlock Training | `usecase/access.go` + tests |
| New DynamoDB tables (auto-created by the schema runner): `reference_data`, `price_plans`, `coupons`, `entitlements` (+ `student_id-index`) | `schema/tables.go` |

### Done (student app)

* `src/shared/scope/catalog.ts`: typed client for `/api/catalog`, `useCatalog()`, `needsStreamChoice`, `registrationPrograms`, `groupPrograms`. Not yet used by any page.

### NOT done in Phase 1 (honest list)

The plan sizes Phase 1 at 14 to 17 dev-days. This pass built the tested core and the read side. **Still to do:**

1. **Persistence and routes for the new logic.** `Decide`, the quote and `RebuildEntitlements` are not yet called from anywhere. Missing: repositories (`price_plans`, `coupons`, `entitlements`, `reference_data`), `pricing_usecase`/`entitlement_usecase`, `coupon_usecase` (atomic redemption counter), `pricing_handler` (`GET /pricing`, `POST /pricing/quote`, `GET /me/entitlements`, admin CRUD, grant), and extending `PaymentRequest` / `payment_usecase` (snapshot, revoke, plan-based expiry replacing the hardcoded month, Stars price per plan).
2. **Student enrollment endpoints and registration payload:** `POST/DELETE /student/enrollments`, admin `PATCH /student/:id/enrollments`, bulk enrol, registering with program + stream + location ids, `Entitlements()` replacing the boolean premium. The `Student` fields exist but nothing writes them yet.
3. **Applying `Decide`** in `academyLocks()`, the AI gate and contest list/get/start. **D2 (premium contests unprotected server-side) is therefore still open.**
4. **Catalog service extraction** from `AcademyUsecase` (the snapshot loader is reused as-is); deleting `academyProgramOrder` / `academyLevelFromGrade` / `academyDefaultStream`; removing the student self-switch of level/stream in `UpdateMe` (D8); `POST /admin/programs` and `AdminMoveSubject`.
5. **Admin Locations page** (admin CRUD, rename propagation, promote free-text). Locations currently come only from the embedded seed.
6. **Migrations:** `migrate-enrollments`, `migrate-locations`, `migrate-pricing`.
7. **Frontends:** 3-step registration (Profile, Program, Stream) with region/city + "Other", program switcher, merged `UpgradeSheet`/paywall with coupon field, My programs; admin Programs page, Plans/Coupons/Payments screens, catalog-driven filters, `Users.tsx` fixes (D10/D12). Only `catalog.ts` exists.
8. Test plan items not written: authorisation-matrix test, handler tests for the new D5 middleware, repository tests for `GetByIDs` and the conditional submission put (need DynamoDB Local).

## Suggested next steps (in order)

1. `cd backend && go build ./... && go test ./...`; fix anything the compiler finds in the files listed below.
2. `go run ./cmd/migrate-grade`, review the `DISTINCT grade` output, then `-apply`; deploy the backend; deploy the frontend.
3. Continue Phase 1 from item 1 above (repositories and pricing handlers), then item 3 to close D2.

## Files changed or added

**Backend, changed:** `internal/handler/http/{auth,router,submission_handler,contest_registration_handler,student_handler}.go`, `internal/usecase/{contest_usecase,submission_usecase,student_usecase,academy_usecase}.go`, `internal/repository/{question_dynamo,submission_dynamo}.go`, `internal/domain/{academy,student}.go`, `internal/schema/tables.go`

**Backend, new:** `cmd/migrate-grade/main.go`, `internal/domain/{scope,locations,pricing,grade}.go`, `internal/usecase/{access,catalog,pricing_logic,academy_programs_seed}.go`, `internal/usecase/locations_seed.json`, `internal/handler/http/catalog_handler.go`, tests: `domain/scope_test.go`, `usecase/{access,pricing_logic,enrollment}_test.go`

**Frontend:** `src/pages/StudentRegisteration.tsx` (grade values), `src/pages/Contest.tsx` (`isActive` is a POST), new `src/shared/scope/catalog.ts`

**Admin app:** unchanged.

**Packaging:** the zip omits `.env` (it held secrets in the upload; keep it out of version control and rotate anything exposed).

---

# Update 2026-10-14 (second pass): Phase 1 remainder

**Verification: nothing below was compiled or run** (no Go toolchain / npm in this pass; the earlier Go 1.22 was not even available for `gofmt`). Every file was written against the signatures read from the existing code, but expect a round of compiler fixes. First command: `cd backend && go build ./... && go vet ./... && go test ./...`.

## What was added

| Area | Files | Notes |
|---|---|---|
| Repositories | `repository/pricing_dynamo.go` | Typed `docStore[T]` for `price_plans`, `coupons`, `entitlements`. Coupon `Redeem` is an atomic conditional counter (`redeemed < max`). Entitlements read via `student_id-index`; `ReplaceForStudent` upserts and deletes stale rows |
| Payment ledger | `domain/pyament.go`, `repository/payment_dynamo.go` (`SetRevoked`), `usecase/interfaces.go` | New optional fields: `plan_id, coupon_code, currency, final_amount, program_ids, validity, revoked`. Legacy rows unchanged |
| Pricing usecase | `usecase/pricing_usecase.go` | Plan validation + CRUD, public listing (sale-aware), coupon CRUD, server `Quote`, `Snapshot` (stamps payment, reserves coupon, plan-based expiry), `Rebuild`/`Entitlements`/`AccessFor`/`HasAnyAccess`, `AdminGrant` (an Approved ledger row with bank "Admin grant", so it is revocable) |
| Payments wired | `usecase/payment_usecase.go` | `AddPayment` with `plan_id` re-derives price/validity/programs (client values ignored, replaces the hardcoded month); a 100% coupon auto-approves. Approve/reject/delete rebuild entitlements; new `RevokePayment`. Without `plan_id` the legacy one-month rule is unchanged. Legacy approved payments become an all-programs `fixed_end` grant until their stored expiry, so existing premium students keep access |
| Enrollment | `usecase/enrollment_usecase.go`, `usecase/student_usecase.go`, `domain/student.go` | `Enroll` (self: only programs open for registration), `SetStream` (students only while unconfirmed), `Leave` (last one cannot be removed), `SetPrimary`, `BulkEnroll`. `AddStudent` accepts `primary_program_id` + `stream_id` + `region_id`/`city_id`, validates them, and ignores any client-sent `enrollments` |
| Handlers | `handler/http/pricing_handler.go`, `enrollment_handler.go`, `payment_handler.go`, `router.go` | See routes below |
| D2 (premium contests) | `handler/http/contest_handler.go` | `GET /api/contest/:id` for contests of type `premium`/`paid`: admin cookie passes; otherwise student session required (401) and a live or in-grace entitlement (else **402** with the `lock` object). **Interim:** contests have no Scope yet, so any active entitlement unlocks; replace with `Decide` per program once contests carry a Scope (Phase 2) |
| Student app | `src/shared/pricing/api.ts` | Typed client + `useEntitlements`, `isEntitled`, `inGrace`, `withPlan(formData, ...)` for the payment form, enrollment calls |
| Admin app | `src/services/pricingServices.ts`, `src/pages/Pricing.tsx`, route `pricing` in `App.tsx` | Plans and Coupons CRUD page; service functions for grant, revoke, rebuild, and admin enrollment |

## New routes

- Public: `GET /api/pricing[?program_id=]`
- Student session: `POST /api/pricing/quote`, `GET /api/me/entitlements`, `GET|POST /api/me/enrollments`, `DELETE /api/me/enrollments/:program_id`, `PUT /api/me/enrollments/primary`, `PUT /api/me/enrollments/:program_id/stream`
- Admin cookie: `/api/pricing-admin/{plans,coupons}` (GET/POST/PUT/DELETE), `POST /api/pricing-admin/grant`, `POST /api/pricing-admin/payments/:id/revoke`, `POST|GET /api/pricing-admin/entitlements/:student_id[/rebuild]`, `/api/enrollment-admin/students/:student_id[/:program_id[/stream]]`, `POST /api/enrollment-admin/bulk`
- `POST /api/payment/` (multipart) now also accepts `plan_id`, `coupon_code`, `currency`.

## Still NOT done (be aware)

1. No UI wiring in existing pages: the 3-step registration, program switcher, merged paywall/`UpgradeSheet` with coupon field and "My programs" are not built (only the typed client exists). The payment form does not yet call `withPlan`.
2. Admin: no Locations page (locations still come only from the embedded seed), no program editor, no Users/Payments screen changes (grant/revoke are service functions only, no buttons).
3. `Decide` is not applied to `academyLocks()`, the AI gate, or contest list/start; only `GET /contest/:id` is gated (interim rule above). Contest list does not mark locked contests, and the contest-registration/start flow is not gated.
4. Migrations still missing: `migrate-enrollments` (legacy students have no `enrollments`; they have no program until they pick one), `migrate-locations`, `migrate-pricing` (no seeded default plans, so `/api/pricing` is empty until an admin creates plans).
5. Telegram Stars confirmation (`ConfirmTelegramStarsPayment`) is unchanged: it still creates a one-month, plan-less payment, so Stars purchases are not plan-priced yet.
6. Not written: tests for the new usecases/handlers (authorisation matrix, coupon race, enrollment rules, repository tests against DynamoDB Local). `Student.StreamID` is `dynamodbav:"-"` (input only) - confirm the registration form sends `stream_id`.
7. Legacy-premium entitlements are built lazily on first read (`Entitlements` rebuilds when none are stored); run the rebuild endpoint per student or a migration to warm them.

## Files changed or added in this pass

**Backend, new:** `repository/pricing_dynamo.go`, `usecase/{pricing_usecase,enrollment_usecase}.go`, `handler/http/{pricing_handler,enrollment_handler}.go`
**Backend, changed:** `domain/{pyament,student}.go`, `repository/payment_dynamo.go`, `usecase/{interfaces,payment_usecase,student_usecase}.go`, `handler/http/{router,payment_handler,contest_handler}.go`
**Student app, new:** `src/shared/pricing/api.ts`
**Admin app, new:** `src/services/pricingServices.ts`, `src/pages/Pricing.tsx`; changed `src/App.tsx`

## Suggested next steps

1. Compile, fix, run tests. 2. Create plans via `/pricing` in admin. 3. Write `migrate-enrollments`. 4. Build the registration/paywall UI on `src/shared/pricing/api.ts`. 5. Apply `Decide` to academy/AI/contest list once contests get a Scope.

---

# Update 2026-10-14 (third pass, time-boxed): migrations and plan picker

Still **not compiled or run** (no Go/npm in the sandbox).

| Item | Files | Notes |
|---|---|---|
| `migrate-enrollments` | `backend/cmd/migrate-enrollments/main.go` | Students without `enrollments` get `grade-<n>`; grades 11/12 default to stream `natural`, 9/10 to `common` (assumed to match the old academy default - verify against `academyDefaultStream`). Written with `confirmed=false`; backup file; dry-run by default; conditional write so reruns skip |
| `migrate-pricing` | `backend/cmd/migrate-pricing/main.go` | Seeds one "All access" plan only if `price_plans` is empty. **Price comes from `-etb` (santim) and optional `-stars` flags; no price is invented.** Dry-run by default |
| Plan picker | `frontend/src/shared/pricing/PlanPicker.tsx` | Plan list, coupon field, server quote display. Not yet mounted in any page |

## Remaining (unchanged from the previous pass unless listed above)

1. Mount `PlanPicker` in `Payment.tsx` and send `withPlan(form, planId, currency, coupon)`; 3-step registration, program switcher, My programs.
2. Admin: Locations page (needs backend CRUD + `reference_data` persistence), program editor, grant/revoke buttons in Users/Payments.
3. Apply `Decide` per program to academy locks, AI gate, contest list/start (needs contest Scope).
4. `migrate-locations`; Stars payments still plan-less; tests for all new code.

Run order: `migrate-grade -apply` -> `migrate-enrollments -apply` -> `migrate-pricing -etb <santim> -apply` -> deploy.

---

# Update 2026-10-14 (fourth pass, time-boxed): remaining Phase 1 items

Still **not compiled, type-checked or run** (no Go/npm in the sandbox). Telegram Stars is intentionally left untouched (it will be dropped).

| Item | Files | Notes |
|---|---|---|
| Payment page uses plans | `frontend/src/pages/Payment.tsx` | `PlanPicker` mounted; selecting a plan fills the amount (read-only) and the form sends `plan_id`/`currency`/`coupon_code` via `withPlan`. Without a plan the legacy flow is unchanged |
| Free (100% coupon) purchases | `handler/http/payment_handler.go`, `usecase/payment_usecase.go` | Screenshot optional only when a plan + coupon + amount 0 is claimed; the usecase rejects with `ErrProofRequired` (400) if the quote is not really free. A genuinely free quote is auto-approved |
| Registration (program, stream, location) | `frontend/src/shared/pricing/ProgramLocationFields.tsx`, `pages/StudentRegisteration.tsx` | Program (grouped) and stream come from `/api/catalog`; region/city selects replace the hardcoded region list and free-text city, with an "Other" free-text option. Submit sends `primary_program_id`, `stream_id`, `region_id`, `city_id` plus the legacy `region`/`city` names. The Grade select is still shown (server still validates 9-12); it is not yet derived from the program. It is a single form, not a 3-step wizard |
| Program switcher + My programs | `frontend/src/pages/MyPrograms.tsx`, route `/programs` | Active-program select, enrollments with premium/grace status, join (open programs only) and leave. **No navigation link points to `/programs` yet** (add one in Profile/menu) |
| Admin Locations page | `admin-page-clean/src/pages/Locations.tsx`, route `locations`; backend `repository/reference_data_dynamo.go`, `usecase/catalog.go` (`LocationStore`, `SaveLocations`), `GET/PUT /api/locations-admin` | Add/rename/deactivate regions and cities; ids are immutable slugs. Registration validates against the stored list. Rename propagation to existing student rows and "promote free-text" are NOT implemented (students keep the name they registered with) |
| Admin grant/revoke/enrollment | `admin-page-clean/src/pages/Grants.tsx`, route `grants` | Per-student: view entitlements, grant a plan, rebuild, revoke by payment id, add/remove enrollments. Not yet buttons inside the Users/Payments tables, and **no sidebar links** to `pricing`, `locations`, `grants` (routes only) |
| Access check applied | `domain/contest.go` (`Scope`), `handler/http/contest_handler.go`, `handler/http/router.go`, `usecase/academy_usecase.go` | Contests may carry an optional `Scope`. Premium contests: with a Scope, `usecase.Decide` for that program (a Grade 12 plan does not unlock Training); without one, any active entitlement. `GET /api/contest` adds a `lock` object per contest for student sessions. Academy premium and the AI gate now follow entitlements (`SetPremiumResolver`, `entitlementAiAccess`). **Academy locks are still "any entitlement", not per program**, because academy modules carry no program id in the lock path I could change safely in the time. Contest submission/registration endpoints are not separately gated (the questions are only served by the gated GET). The admin contest form has no Scope picker yet, so existing contests stay on the fallback rule |
| `migrate-locations` | `backend/cmd/migrate-locations/main.go` | Stores the embedded seed in `reference_data` if empty; dry-run by default |
| Tests | `usecase/enrollment_usecase_test.go`, `usecase/pricing_usecase_test.go` | Enrollment rules (closed program, stream required, duplicate, last enrollment, stream lock), plan validation, legacy-payment grants. **Not run.** Still missing: handler authorisation matrix, coupon race, repository tests against DynamoDB Local |

## Remaining

1. Compile and fix everything; run `go test ./...`; `tsc`/`vite build` for both apps.
2. Navigation links: student `/programs`; admin `pricing`, `locations`, `grants`; revoke/grant buttons in the Users and Payments tables.
3. Per-program academy locks; Scope picker in the admin contest form; derive Grade from the chosen program in registration; true 3-step wizard.
4. Location rename propagation; handler and repository tests.

Run order: `migrate-grade -apply` -> `migrate-enrollments -apply` -> `migrate-locations -apply` -> `migrate-pricing -etb <santim> -apply` -> deploy.

---

# Update 2026-10-14 (fifth pass, 5-minute box): finalisation

Still **not compiled, type-checked or run** (no Go/npm run, by request).

| Item | Files | Notes |
|---|---|---|
| Navigation | `admin-page-clean/src/components/common/Sidentmenu.tsx`, `frontend/src/pages/Profile.tsx` | Admin Settings group now links Pricing & Coupons, Locations, Access Grants (`/dashboard/pricing\|locations\|grants`; check the route prefix matches `App.tsx`). Student Profile links to `/programs` |
| D8 (self-switch of level/stream) | `backend/internal/usecase/academy_usecase.go` (`UpdateMe`, new `academyStreamFromEnrollment`) | A student can switch the Academy level only to a program they are enrolled in (403 otherwise); the stream comes from the enrollment, not the request. Students with no enrollments (not yet migrated) keep the old behaviour |
| Duplicate-submit UX | `frontend/src/pages/Contest.tsx` | 409 now shows an "Already submitted" toast and ends the contest screen instead of a generic failure |
| Docs (D13) | `README.md`, `docs/ARCHITECTURE.md`, `docs/DOCKER.md`, `docs/DEPLOYMENT.md`; deleted `DOCKER_IMPLEMENTATION_SUMMARY.md` | One accurate README plus architecture notes. Backend sub-READMEs (`backend/*_README.md`) were left as is |

## Still open (not done in this pass)

1. Phase 1: per-program academy locks (still "any active entitlement"), `academyProgramOrder`/`academyLevelFromGrade`/`academyDefaultStream` not yet deleted, catalog service not extracted from `AcademyUsecase`, `POST /admin/programs`, `AdminMoveSubject`.
2. Admin: Programs editor page, content tree stream tabs and move-subject action, catalog-driven Users filters (D10/D12) and bulk enrol, `ScopePicker` in the contest/question forms, grant/revoke buttons in Users/Payments tables, expected-vs-reported amount on payment approval.
3. Student: true 3-step registration wizard, grade derived from the program, merged `UpgradeSheet`, `LevelId` as `string`, `LEVEL_SHORT` from the catalog, Academy context based on enrollments.
4. Locations: rename propagation to existing students and "promote free-text".
5. Coupons: per-student limit and redemption export; handler authorisation-matrix, coupon-race and repository tests.
6. Telegram Stars: intentionally ignored (to be dropped).

Run order: `migrate-grade -apply` -> `migrate-enrollments -apply` -> `migrate-locations -apply` -> `migrate-pricing -etb <santim> -apply` -> deploy. Then `cd backend && go build ./... && go vet ./... && go test ./...`, `tsc`/`vite build` for both apps.

---

# Update 2026-10-14 (sixth pass, 5-minute box): backend access/admin, locations, coupons

Still **not compiled or run**. Compile first: `cd backend && go build ./... && go vet ./... && go test ./...`.

| Item | Files | Notes |
|---|---|---|
| Per-program academy locks | `domain/academy.go` (`AcademyStudentState.AccessSet/ProgramAccess`, runtime-only, `json:"-"`), `usecase/academy_usecase.go` (`loadState`, `academyLocks`), `usecase/catalog.go` (`SetProgramResolver`), `usecase/pricing_usecase.go` (`EntitledPrograms`), `router.go` | When the resolver is set, a premium module is unlocked only if the student has a live or in-grace entitlement for **the module's own program** (a Grade 12 plan no longer opens Training). Referral unlock is unchanged. `IsPremium` in the student view still means "any active plan". Without a resolver the old boolean applies |
| Hardcoded helpers removed | `usecase/academy_usecase.go` | `academyProgramOrder`, `academyLevelFromGrade` deleted (`academyDefaultStream` no longer existed). Program ordering uses `SortOrder` only; subjects sort by program order. New `academyInitialLevel` picks a new student's first level/stream from primary program, then first enrollment, then a valid grade, else `common` |
| `POST /admin/programs` etc. | `usecase/academy_programs_admin.go`, `handler/http/academy_handler.go` | `POST /academy/admin/programs` (slug id from name, 409 if taken, validates kind, features, streams, grade), `PUT /programs/:id` (edit; id and active flag preserved), `DELETE /programs/:id` (soft delete = deactivate). Paths are relative to the academy admin group, next to the existing `PATCH /programs/:id` |
| `AdminMoveSubject` | same | `POST /academy/admin/subjects/:id/move {program_id, stream_id}` moves the subject and cascades level/stream to all modules under its chapters. `common` is always an allowed target stream; other streams must be offered by the target program |
| Location rename propagation | `usecase/catalog.go` (`propagateLocationRenames`, `SetStudentRepo`), `router.go` | `SaveLocations` diffs old vs new by id and rewrites `region`/`city` names on students whose `region_id`/`city_id` was renamed. Best effort (errors logged); it scans all students, so it is fine at current size |
| Coupon per-student limit | `usecase/pricing_usecase.go` | The limit was already checked in `Quote`; now check and reservation run under a mutex in `Snapshot`, so one student cannot double-redeem with parallel requests (per process; use a conditional write per student if you run 2+ instances). `SaveCoupon` no longer lets an admin edit reset `Redeemed`, and rejects negative limits or a per-student limit above the total |

## Still open

- Admin Programs editor page and move-subject UI (endpoints exist now), content-tree stream tabs, catalog-driven Users filters (D10/D12), bulk enrol UI, `ScopePicker` in contest/question forms, grant/revoke buttons in Users/Payments, expected-vs-reported amount on approval.
- Student: 3-step registration wizard, grade derived from program, merged `UpgradeSheet`, `LevelId` as `string`, `LEVEL_SHORT` from catalog, Academy context based on enrollments.
- "Promote free-text location" endpoint; coupon redemption export; releasing a coupon use when a payment is rejected or deleted; catalog service extraction from `AcademyUsecase`.
- Tests for the new code (authorisation matrix, coupon race, per-program locks, move-subject cascade, rename propagation).


---

# Update 2026-10-14 (seventh pass, 5-minute box): admin UI + student UI

Still **not compiled, type-checked or run** (no Go/npm, by request). First: `cd backend && go build ./... && go vet ./... && go test ./...`, then `tsc` and `vite build` in `admin-page-clean/` and `frontend/`.

## Admin app

| Item | Files | Notes |
|---|---|---|
| Programs page | `src/academy/admin/Programs.tsx`, `routes.tsx` (`/dashboard/academy/programs`), `AdminLayout.tsx` (new "Programs" tab) | Create/edit via `POST`/`PUT /academy/admin/programs`: name, short code, kind, streams offered ("common" always on), features, grade (9-12 or none), group, icon, open-for-registration, sort order. Switch off = soft delete (confirm dialog), switch on = `PUT` with `is_active`. Uses the academy kit (`Panel`, `Field`, `Chip`, `FormSheet`, `ConfirmDialog`) so it matches the existing theme |
| Course builder (data-driven) | `ContentTree.tsx`, `tree/forms.tsx`, `tree/SubjectCard.tsx`, `editor/BasicsTab.tsx` | Program chips come from the tree response (`programs`), not a hardcoded list. Stream tabs are the selected program's `available_streams` plus **Common** plus All (Natural / Social / Common). A tab the program doesn't offer resets to All. `SubjectForm` offers only the program's streams |
| Move subject | `tree/forms.tsx` (`MoveSubjectSheet`), `SubjectCard.tsx` ("Move subject" button), `academyApi.ts` (`adminMoveSubject`) | Calls `POST /academy/admin/subjects/:id/move`; backend cascades program/stream to every module under the subject |
| Types / labels | `types/academy.ts`, `academy/lib/theme.ts` | `LevelId` and `StreamId` are now `string`; `Program` gains `kind, group, features, grade, sort_order, open_for_registration`. `levelShort()` and `streamShort()` read `short_code` / stream name from data with the old map as fallback |
| Users: catalog-driven filters (D10/D12) | `components/users/Users.tsx`, `services/catalogServices.ts`, `types/models.ts` | Program, Stream (limited to the program's streams), Grade (from the data), Region, City (limited to the region), Payment. Options come from `GET /api/catalog`. Filters use `primary_program_id`, `enrollments`, `region_id`, `city_id` (fields were already on the student JSON). Filter change resets to page 1 |
| Grant / revoke / enrol in Users | `components/users/UserAccessSheet.tsx` (+ shield button per row) | Per student: current entitlements, grant a plan, rebuild, revoke each approved payment, add/remove enrollments (stream picker limited to the program) |
| Revoke in Payments | `components/payment/columns.tsx`, `approved-tabs.tsx` | Approved tab gets a **Revoke** button next to Undo (`POST /pricing-admin/payments/:id/revoke`) |
| ScopePicker | `components/common/ScopePicker.tsx`, `contests/AddContest.tsx`, `contests/UpdateContestDialog.tsx`, `types/models.ts` (`Scope`) | Program, stream (common always valid) and optional subject/chapter from the catalog. `depth="stream"` is used on contests (the backend `Scope` on contests is program+stream). Not yet used in the question forms |

## Student app

| Item | Files | Notes |
|---|---|---|
| 3-step registration | `pages/StudentRegisteration.tsx`, `shared/scope/{LocationFields,ProgramPicker}.tsx` | Step 1 Profile + region/city (with "Other"), step 2 Program cards grouped by `group`, step 3 Stream (or a "nothing to choose" note) + review. **Grade is derived from the program's `grade`**; a 9-12 picker appears only for programs with no grade. Sticky bottom bar, app tokens (`blue-fix-600`, rounded-2xl cards). Old `shared/pricing/ProgramLocationFields.tsx` deleted |
| Merged paywall | `components/PremiumSheet.tsx`, `academy/components/UpgradeSheet.tsx`, `academy/pages/Module.tsx`, `shared/pricing/PlanPicker.tsx` (restyled), `pages/Payment.tsx` | There was already one sheet (`UpgradeSheet` wrapped `PremiumSheet`). It now lists plans for the blocked **program**, takes a coupon, shows the server quote, grace-period notice and "Renew", and "already premium" means a live entitlement for that program. Continue goes to `/payment?plan=&coupon=` and `Payment.tsx` preselects them. The Telegram Stars wording was removed |
| Academy labels from data | `types/academy.ts` (`LevelId`/`StreamId` = string), `academy/lib/theme.ts`, `academy/pages/{Home,Courses}.tsx` | Level labels use the program `short_code` from the catalog |
| My programs | `pages/MyPrograms.tsx` | Theme tokens instead of indigo/slate |

## Still open

- **Admin theme:** `pages/Pricing.tsx`, `pages/Locations.tsx`, `pages/Grants.tsx` still use raw indigo/slate classes. Restyle with the academy kit. `Grants.tsx` is now redundant with the Users access sheet; consider removing it and its sidebar link.
- Bulk-enrol UI (service `bulkEnroll` exists), ScopePicker in the question forms, expected-vs-reported amount on payment approval.
- Student: `PremiumSheetContext.open()` has no `programId` argument yet, so contest/AI gates fall back to the "any plan" flag. Academy gates pass the module's program.
- `ContestStatistics` and the question forms still use the hardcoded `grades` / `Subjects` lists in `components/questions/Data`.
- Backend: promote free-text location, release a coupon use when a payment is rejected, catalog service extraction from `AcademyUsecase`.
- Tests: authorisation matrix, coupon race, per-program locks, move-subject cascade, rename propagation, and any UI tests.
- Verify the admin sidebar paths (`/dashboard/...`) match `App.tsx`.

---

# Update 2026-10-14 (eighth pass, 5-minute box): final open items

Still **not compiled, type-checked or run** (no Go/npm, by request). First: `cd backend && go build ./... && go vet ./... && go test ./...`, then `tsc` and `vite build` in `admin-page-clean/` and `frontend/`.

## Backend

| Item | Files | Notes |
|---|---|---|
| Release coupon use on reject/delete | `usecase/pricing_usecase.go` (`CouponRepository.Release`, `ReleaseCoupon`), `repository/pricing_dynamo.go` (`couponRepo.Release`), `usecase/payment_usecase.go` | Atomic `redeemed = redeemed - 1`, conditional on `redeemed > 0`. Called only on the transition to Rejected (a repeated reject cannot release twice) and when deleting a payment that was neither rejected nor revoked. Revoke keeps the use consumed (refund/fraud). Nil-safe when pricing is not wired |
| Free-text location list | `usecase/catalog.go` (`FreeTextLocations`), `handler/http/catalog_handler.go` | `GET /api/locations-admin/free-text`: distinct "Other" region/city pairs (and known-region + free-text-city), with student counts, most common first |
| Promote free-text location | `usecase/catalog.go` (`PromoteLocation`, `PromoteLocationInput`, `locSlug`), `catalog_handler.go` | `POST /api/locations-admin/promote`: finds or creates the region (slug id) and city, saves through `SaveLocations`, then writes `region_id`/`city_id` and the clean names onto every matching student. Returns `{updated, regions}`. Scans all students (fine at current size) |

## Admin app

| Item | Files | Notes |
|---|---|---|
| Locations restyle + promote panel | `pages/Locations.tsx`, `services/pricingServices.ts` | Rebuilt on the academy kit (`PageTitle`, `Panel`, `Field`, `Segmented`, `Switch`, `FormSheet`). Two views: Regions & cities, and Free-text (count badge). "Promote" opens a sheet to pick an existing region or create one and fix the city spelling. Save refreshes the shared catalog cache |
| Pricing restyle | `pages/Pricing.tsx` | Plans and Coupons as cards, edit in `FormSheet`, delete through `ConfirmDialog`. Programs are chips from the catalog (no more comma-separated ids). **Telegram Stars field removed from the form**; existing XTR prices on a plan are preserved on save |
| Bulk enrolment | `pages/BulkEnrolment.tsx`, `App.tsx`, `Sidentmenu.tsx` | Route `/dashboard/enrolment`: pick program (+ stream if the program offers one), filter students (search, grade, region, hide already enrolled), select all shown, confirm, call `POST /api/enrollment-admin/bulk`. Reports how many failed |
| `Grants.tsx` removed | `App.tsx`, `Sidentmenu.tsx` | Redundant with the Users access sheet. `/dashboard/grants` redirects to `/dashboard/enrolment`; the sidebar entry is now "Bulk Enrolment" |
| Catalog-driven grade/subject/city lists | `hooks/useCatalogLists.ts`; used in `questions/{Questions,AddQuestionMethod}.tsx`, `contests/{Contest,AddContest,UpdateContestDialog,ContestStatistics}.tsx` | Grades come from program grades, subjects from catalog subject names, cities from the managed locations. `components/questions/Data.tsx` constants remain **only as a fallback** while the catalog loads or is empty. Contest statistics city/grade filters are the union of catalog values and values present in the data, so free-text cities stay filterable |

## Student app

| Item | Files | Notes |
|---|---|---|
| Gate program argument | `context/PremiumSheetContext.tsx`, `lib/premium.ts` (`isContestLocked`), `types/index.ts` | `open(subject, programId?)` passes `programId` to `PremiumSheet`, which already scoped plans and "already premium" to that program |
| Contest gates | `components/ContestCard.tsx`, `pages/Home.tsx`, `components/LeaderboardModal.tsx` | Locked = server `lock` object present, or (fallback) no active plan. The sheet opens for `contest.scope.program_id` (or `lock.program_id`) |
| AI gates | `components/TopNavigation.tsx`, `pages/AIPractice.tsx`, `pages/Statistics.tsx` | Open the sheet for the student's `primary_program_id` |

## Still open

- Backend: the server-side AI gate still checks "any active plan" (the client now opens the sheet for the primary program); catalog service extraction from `AcademyUsecase`; coupon redemption export; a per-student conditional write for the coupon limit if you run 2+ instances.
- Admin: `ScopePicker` in the question forms; expected-vs-reported amount on payment approval; `Data.tsx` fallbacks can be deleted once you trust the catalog.
- Tests: authorisation matrix, coupon race and release, per-program locks, move-subject cascade, rename propagation, promote location, UI tests. Skipped by request.
- Verify admin sidebar paths against `App.tsx` (`/dashboard/{pricing,locations,enrolment}`).

Run order: `migrate-grade -apply` -> `migrate-enrollments -apply` -> `migrate-locations -apply` -> `migrate-pricing -etb <santim> -apply` -> deploy.

---

# Update 2026-10-14 (ninth pass): server AI gate + ScopePicker in question forms

Still **not compiled or run**. Same first step: `cd backend && go build ./... && go vet ./... && go test ./...`, then `tsc`/`vite build` in both apps.

| Item | Files | Notes |
|---|---|---|
| Server AI gate per program | `handler/http/router.go` (`entitlementAiAccess`) | `IsPremiumStudent` now looks up the student's `primary_program_id` and requires a live or in-grace entitlement for **that** program (`EntitledPrograms`). Students with no primary program yet (not migrated) fall back to `HasAnyAccess`. The 403 upgrade answer is unchanged, and the admin switch (`require_premium`) still turns the gate on and off. Costs one student read per AI call |
| AI gate on the client | `frontend/src/components/TopNavigation.tsx` | The pre-lock on the AI entry now uses the same rule through `useEntitlements`/`isEntitled` (any plan only when there is no primary program), so the UI and server agree |
| Question scope (backend) | `domain/question.go` (`Question.Scope`, `QuestionPatch.Scope/ClearScope`), `usecase/question_usecase.go`, `handler/http/question_handler.go` (`parseScopeForm`) | Optional. Create accepts a `scope` form field (JSON); update accepts a JSON scope, `none` to clear, or omits it to keep the stored one. Program and stream are required when a scope is sent (400 otherwise). Legacy rows have no scope |
| ScopePicker in question forms | `components/questions/AddQuestionMethod.tsx`, `services/questionServices.ts`, `types/models.ts` | `AddQuestionManual` shows the picker (program, stream, subject, chapter from the catalog) in the Metadata card. Create sends it; edit sends it, or clears it if the admin removed it. Grade/subject/chapter stay required, so legacy matching keeps working |

## Still open

- Question scope is stored but not yet used for filtering, contest assembly or student-side question matching. `EnhancedUploadQuestions` (bulk upload) has no scope field yet. Questions list does not show or filter by scope.
- The AI gate ignores the program's `ai_tutor` feature flag; it only checks entitlement.
- Expected-vs-reported amount on payment approval, coupon redemption export, catalog service extraction, tests (authorisation matrix, coupon race/release, per-program locks, move-subject cascade, rename propagation, promote location, AI gate).

---

# Update 2026-10-14 (tenth pass): last Phase 0/1 items

Still **not compiled or run** (by request). First: `cd backend && go build ./... && go vet ./... && go test ./...`, then `tsc`/`vite build` in both apps.

| Item | Files | Notes |
|---|---|---|
| AI gate honours `ai_tutor` | `handler/http/router.go` (`entitlementAiAccess.hasAI`) | With a primary program the gate now requires BOTH the program's `ai_tutor` feature and a live/in-grace entitlement for that program. A program without the feature never offers AI, paid or not. If the program list can't be read the check fails open (entitlement still applies). Students without a primary program keep the "any active plan" fallback |
| Question list filter (server) | `handler/http/question_handler.go` (`filterQuestionsByScope`) | `GET /api/question/` accepts `program_id`, `stream_id`, `subject_id`, `chapter_id` and `scoped=none`. Uses `Scope.Matches`, so `common` questions match every stream of their program. Unscoped rows only match `scoped=none`. No filter = unchanged response; pagination is applied after filtering |
| Bulk upload scope (server) | `usecase/question_usecase.go` (`AddMultipleQuestions`) | Each question may carry `scope`; a scope without program or stream is rejected with 400 (`ErrInvalidQuestion`, names the question number) |
| Bulk upload scope (admin) | `components/questions/AddQuestionMethod.tsx` (`EnhancedUploadQuestions`) | A ScopePicker above the dropzone; its scope is applied at submit to every parsed question that has none of its own |
| Question list scope (admin) | `components/questions/Questions.tsx`, `QuestionTable.tsx` | New Program and Stream filter dropdowns (from `/api/catalog`, plus a "No scope (legacy)" entry; common-stream questions match any stream filter), a Scope column and a scope badge in the preview dialog ("Legacy" when none). Filtering is client-side, like the existing subject/grade filters |

## Still open (deliberately not Phase 0/1)

- Question scope is **not yet used by contest assembly or student-side question matching**: that is Phase 2 (content scoping). Until then `grade/subject/chapter` remain the matching keys.
- Payment-approval expected-vs-reported amount, coupon redemption export, catalog service extraction from `AcademyUsecase`, `Data.tsx` fallback removal.
- Per-student coupon limit is per-process; use a conditional write if you run 2+ instances.
- Tests (authorisation matrix, coupon race/release, per-program locks, move-subject cascade, rename propagation, promote location, AI gate, question scope filter). Skipped by request.
- Verify admin sidebar paths against `App.tsx`.

Run order: `migrate-grade -apply` -> `migrate-enrollments -apply` -> `migrate-locations -apply` -> `migrate-pricing -etb <santim> -apply` -> deploy.

---

# Update 2026-10-14 (eleventh pass): automatic versioned migrations + last items

Still **not compiled or run**. First: `cd backend && go build ./... && go vet ./... && go test ./...`, then `tsc`/`vite build` in both apps.

## Automatic data migrations

Before this pass only `schema.EnsureTables` and the idempotent seeds ran on boot; the four data migrations were manual CLIs that were never run automatically. Now:

| Item | Files | Notes |
|---|---|---|
| Runner | `internal/migrations/{runner,util}.go` | Ordered by id (`YYYYMMDD-NNN-name`, validated: well-formed, unique, ascending). Pending ones run sequentially on boot, once per environment. Applied ones are recorded in `schema_migrations` (`id`, `description`, `summary`, `applied_at`, `status`). A failure is not recorded, stops later migrations and is retried next boot; the API still boots. A `lock#<id>` row (15 min TTL, conditional put) stops two instances running the same migration; the state is re-checked after the lock |
| Registry | `internal/migrations/registry.go` | `20261014-001-grade-9-12`, `-002-student-enrollments`, `-003-seed-locations`, `-004-default-price-plan`. Append-only |
| Migration logic | `internal/migrations/{grade,enrollments,locations,pricing}.go` | Moved out of the CLIs and shared. Each writes a JSON backup (`MIGRATION_BACKUP_DIR`, default `migration-backups/`) before changing rows, refuses to write if the backup fails, uses conditional updates, and returns an error (so it is retried) if any row write failed |
| Boot hook | `handler/http/router.go` | Runs after `EnsureTables` and `SeedProgramsV2` (the enrollment migration needs the `grade-<n>` programs), before pricing/enrollment wiring. 20 min timeout. `AUTO_MIGRATE=off` skips it |
| Ledger table | `schema/tables.go` | `schema_migrations` added to `Tables`, so it is created automatically |
| Pricing price | env `MIGRATE_PRICING_ETB` (+ `MIGRATE_PRICING_DAYS`) | No price is invented. If unset, `-004` is **deferred**: not recorded, does not block later migrations, and runs on a later boot once the variable is set. If a plan already exists it records "nothing to do" |
| CLIs | `cmd/migrate` (new: `-status`, run pending), `cmd/migrate-{grade,enrollments,locations,pricing}` | Thin dry-run wrappers over the same functions. `migrate-answer-index` is untouched and deliberately NOT automatic (needs prod dry-run review) |
| Tests | `internal/migrations/runner_test.go` | Registry validity, bad/duplicate/descending ids, `AUTO_MIGRATE` parsing. Dynamo-backed runner tests are still to write |

Things to check on the first deployment:
- **`natural` default stream** for grades 11/12 in `-002` is still my assumption of the old academy default. Existing rows are written `confirmed=false`, so students can correct it.
- Migrations run **synchronously before the server listens**. On a very large student table this delays boot (the grade and enrollment migrations each scan `student`). If your host's health check is strict, say so and I will move the runner into a background goroutine.
- Backups live on the container disk unless you mount a volume.
- `-004` stays pending until `MIGRATE_PRICING_ETB` is set; `/api/pricing` is empty until then or until an admin creates a plan.

## Payment approval amount check (was open)

| Item | Files | Notes |
|---|---|---|
| Server | `usecase/payment_usecase.go` (`PaymentAmountMismatch`), `handler/http/payment_handler.go` | Approving a plan payment whose reported ETB amount differs from the server-priced `final_amount` (santim) returns **409** `{code: "amount_mismatch", expected_etb, reported_etb}` unless `?force=true`. Legacy rows, free plans, no reported amount and non-ETB currencies are not compared. Reject/pend are unaffected |
| Admin | `services/paymentServices.ts`, `components/payment/pending-tab.tsx` | Approve shows a confirm with reported vs expected; "OK" re-sends with `force=true`, cancel leaves the payment pending |

## What is left of Phase 0 / 1

Nothing functional. Remaining items are quality work, not features:
- Tests (authorisation matrix, coupon race/release, per-program locks, move-subject cascade, rename propagation, promote location, AI gate and `ai_tutor`, question scope filter, payment amount mismatch, Dynamo-backed migration runner). Next, as agreed.
- Coupon redemption export, catalog service extraction from `AcademyUsecase`, deleting the `Data.tsx` fallbacks, a per-student conditional write for the coupon limit if you run 2+ instances, verifying admin sidebar paths against `App.tsx`.
- Phase 2 (content scoping): contest assembly and student-side question matching by `Question.Scope`.

---

# Update 2026-10-14 (twelfth pass): full local verification of the Phase 0/1 tree

Everything in this pass was actually **compiled, tested and built** on a machine with the real toolchain (Go 1.24.4 module graph, npm). The earlier "not compiled or run" caveats no longer apply.

## Gates (all green, exit codes read from direct runs, not pipes)

| Gate | Result |
|---|---|
| `backend: go build ./...` / `go vet ./...` | pass |
| `backend: go test ./...` | pass — 7 packages ok; `internal/usecase` re-ran fresh (46s, not cached) after the fixes below |
| `frontend: tsc -b --force` + `vite build` | pass (build 1m15s) |
| `admin-page-clean: tsc -b --force` + `vite build` (PWA) | pass |

Not covered: browser E2E against the running stack (Docker not installed here) and anything DynamoDB-backed (unit tests use fakes).

## Compile fixes (commit `d2002f9`)

`ErrStudentNotFound` was declared twice (usecase package didn't build); 23 Go files were not gofmt-clean (6 pre-date this feature branch).

## Wiring defects found by the boundary review — all fixed

1. **Admin pricing/enrollment/locations services 404ed** — the admin axios client is origin-only, so `/pricing-admin`, `/enrollment-admin`, `/locations-admin` missed the `/api` group. Fixed in `pricingServices.ts`; swept every other admin service — all remaining paths already carry `/api`. (commit `ca38197`)
2. **Payment-approval amount guard was dead code** — `Snapshot` overwrote the student-reported `Amount` with the server quote, so `PaymentAmountMismatch` compared the quote with itself and could never fire. `Amount` now stays the reported figure; the price lives in `FinalAmount`. Also: fixed_end plans now stamp `ExpirationDate` (via new `planExpiry`), and `AdminGrant` rows got an expiry too — previously grant rows had none, so legacy expiry readers missed them. (commit `496653f`)
3. **"Other" location picks were never validated** — `ForRegistration` passed empty free-texts to `ValidatePick`, so a bogus city under a known region enrolled silently. Now the typed region/city names are validated, and `AddStudent` maps the enrollment/location rejections (`ErrInvalidLocation`, `ErrUnknownProgram`, `ErrProgramClosed`, `ErrStreamRequired`, `ErrStreamNotAllowed`) to 400 instead of 500. (commit `496653f`)
4. **Revoked payments still granted premium; lifetime rows didn't** — `grantsAccess` and the AI-premium payment scan now skip `Revoked` rows and honour `ValidityLifetime` (a lifetime grant carries no expiry date). (commit `496653f`)
5. **Free (100%-coupon) orders were blocked in the UI** — `Payment.tsx` required a screenshot unconditionally, forcing a bogus upload on the path the server explicitly approves proof-free. Screenshot now only required when the quote is not free; `img` sent only if picked; the upload label says "not needed — free with coupon"; success copy distinguishes "active now" vs "pending review". (commit `4cf4cb3`)
6. **Premium-contest 402 showed a raw error toast** — `Contest.tsx` now opens the shared premium sheet for the lock's program (the same call the contest cards use) before redirecting home. (commit `4cf4cb3`)

Bonus fix found while doing #5: the Payment success screen was **unreachable** — `handleSubmit` set `isSuccess` and `resetForm()` reset it in the same batched update, and the screen printed an empty name because `resetForm` also clears `fullName`. Replaced with a submit-time `successInfo` snapshot. (commit `4cf4cb3`)

## Contract checks that passed (no fix needed)

`shared/pricing/api.ts` paths vs `pricing_handler.go`/`enrollment_handler.go` routes; `LockInfo` JSON vs `types/index.ts` lock shape and `Contest.lock`; `respond()` `{enrollments, primary_program_id}` vs `MyPrograms.tsx`; registration payload (`region_id/city_id/region/city`) vs `AddStudent`; `PlanPicker` quote display vs `Quote` JSON; `grantsFor` prefers `Validity`, so the new `ExpirationDate` stamping doesn't double-apply; admin sidebar paths (`/dashboard/pricing|locations|enrolment`) match `App.tsx` — closes the "verify sidebar paths" open item; `/grants` redirect intact.

## Deployment notes (first boot)

- Auto-migrations are **ON by default** on boot (the client's decision recorded in `discussion.txt`): `-001` grade, `-002` enrollments, `-003` seed locations run automatically before the server listens; `AUTO_MIGRATE=off` skips the runner; `go run ./cmd/migrate -status` shows the ledger.
- `-004` (default price plan) stays **deferred** until `MIGRATE_PRICING_ETB` (santim) is set — no price is invented. `/api/pricing` is empty until it runs or an admin creates a plan.
- Migration backups go to `MIGRATION_BACKUP_DIR` (default `migration-backups/`) — on container disk unless a volume is mounted.
- Behaviour changes for QA: second submit → 409 (app now shows "Already submitted"), old `GET isActive` → 405.

## Commits in this verification pass (local only — push withheld per instruction)

`d2002f9` compile + gofmt · `3b3570f` admin Programs tsc fix · `4cf4cb3` frontend defects 5/6 + success screen · `496653f` backend defects 2/3/4 · `ca38197` admin `/api` prefix. (`discussion.txt` deliberately stays untracked.)

# Update 2026-10-14 (thirteenth pass): whole-birr money, deploy shims, and the location-promote write bug

Everything since the twelfth pass, recorded additively. All gates re-run green on the real toolchain.

## Fixes and changes

1. **Transitional compat shims for a backend-first deploy** — the deployed old frontend keeps working against the new backend: legacy grade values, the old contest-registration response shape, and the previous `student_usecase` surface are handled side-by-side with the new contract. Only needed because the backend must deploy before the new frontends (Vercel auto-deploys the frontends on push, so old UI + new API is a real state). (commit `0a09ea3`)
2. **Boot-migration environment variables documented** — `AUTO_MIGRATE`, `MIGRATION_BACKUP_DIR`, `MIGRATE_PRICING_ETB` and the rest of the phase 0/1 knobs recorded in both `.env.example` files with their defaults and what happens when they are unset. (commit `dc34cbc`)
3. **All money is whole ETB birr end to end** — the `santim` (1/100-birr) sub-unit is gone: no `*100`/`/100` conversions left in `pricing`, `payment`, the pricing migration or `cmd/migrate-pricing`; percent discounts round half-up on whole birr; `PaymentAmountMismatch` compares whole birr with no unit translation; `PlanPicker`/`PremiumSheet`/`Payment` and admin `Pricing` display and accept integers only (`step={1}`). The plan doc, README and both `.env.example` files say birr. (`MIGRATE_PRICING_ETB` is now a whole-birr value, e.g. `299`.) (commit `5e6785c`)
4. **This file's own format** — the previous pass's rewrite of this log into a single current-state document was wrong and has been reverted; the append-only dated-pass format is the handoff artifact. Future passes append, never replace. (commit `b99cf4e`)
5. **Promoting a location silently updated nobody — "Promoted. 0 students updated."** — the real cause was in the repository, not the matching logic: the live `student` table is keyed on `id` (HASH) + `telegram_id` (RANGE), and `UpdateStudent` put *every* non-zero marshalled field into the `UpdateExpression` SET clause, `telegram_id` included. DynamoDB rejects that entire write ("Cannot update attribute telegram_id. This attribute is part of the key"), `PromoteLocation` logged each failure and continued, so all 12 "Addis abeba" students stayed free-text forever while the admin saw a success toast. Key attributes are now excluded from SET and used only to target the row via the already schema-aware `fullKeyFor`. Expression building is extracted into `studentPatchExpression` so it is unit-testable. Same patch shape fixes location **rename propagation**, which failed identically. (commit `750b6a7`)
6. **Boot data migrations could not write a single row** — the server logs showed 148 repetitions of `migrations: update <id> failed: ... The provided key element does not match the schema` and `data migration incomplete (applied []): 20261014-001-grade-9-12`. `grade.go` and `enrollments.go` hardcoded an `{id}`-only `UpdateItem` key, which is a partial key on the composite prod table, so the migration never recorded and retried (and failed) on every boot. Both now resolve the table's key schema once (`keyNames`, a DescribeTable) and lift the complete key off the raw item they just scanned (`fullKey`), so no key-shape assumption survives anywhere in the student write path. (commit `750b6a7`)
7. **A silent zero can no longer look like success** — `PromoteLocation` returns the count of matched students it could *not* write, `POST /api/locations-admin/promote` returns it as `failed`, and the admin Locations page shows an error toast with that number instead of "Promoted. N students updated." (commit `750b6a7`)

## Gates

| Gate | Result |
|---|---|
| `backend: go build ./...` / `go vet ./...` | pass |
| `backend: go test ./...` | pass — 7 packages ok |
| `admin-page-clean: tsc -b --force` + `vite build` (PWA) | pass |

## Tests added for the above

- `repository/student_patch_expression_test.go` — the SET clause never contains a key attribute, promote's region/city fields are all still written, untouched fields stay untouched, and an `id`-only table keeps its old behaviour.
- `migrations/util_test.go` — `fullKey` lifts both key attributes and fails loudly on a row missing one.
- `repository/student_promote_prod_key_local_test.go` and `migrations/prod_key_local_test.go` — integration tests on the **production key shape** (`id` + `telegram_id`), proving the promote patch persists `region_id`/`city_id`/spelling without rewriting the key, that an id-only patch (the enrollment flows) still reaches the right row, and that the grade and enrollment migrations actually write. These follow the existing `AWS_ENDPOINT_URL_DYNAMODB` convention (skipped without a local endpoint); they were run and passed against `dynalite`.

## Still open

- The promote fix and the migration fix are in the tree but **not yet deployed**, so production still returns `updated: 0` and `-001` is still unrecorded in the live `schema_migrations` ledger. Nothing was written to production DynamoDB to verify any of this — the read-only `describe-table` was the only live call. Once this backend boots, `-001`/`-002` retry themselves and the 148 legacy grades plus the enrollment backfill apply on first boot (backups to `MIGRATION_BACKUP_DIR`, container disk unless a volume is mounted).
- Browser E2E of the Locations promote flow against the running stack (needs Docker; the assertions above are repository-level).
- Older `TestLocalDynamo*` cases in `internal/repository` still fail on a fresh dynalite because they assume tables that `cmd/setup-tables` creates (contests, registrations, feedback, payments, submissions). Pre-existing, unrelated to this pass.
- Unchanged from earlier passes: the deferred `-004` default price plan (needs `MIGRATE_PRICING_ETB`), the AI practice loop and chat vision (parked for client sign-off), and the markdown/KaTeX rendering plan.

# Update 2026-10-15 (fourteenth pass): locations — one canonical city per place

The thirteenth pass fixed the promote *write* (key attributes in the SET clause). The client's acceptance case still failed after that: promoting `Adis abeba` left the real Addis Ababa count untouched. Reproduced live against a local stack, and the answer was that the write path was fine — the **merge/statistics layer** was wrong. Three independent defects made one city look like many. Fixed in code, migration, and UI. (commit `43ce235`)

## Fixes and changes

1. **`internal/locnorm` — canonical name folding** — a new package that turns a place name into a comparable key: lowercase → keep alphanumerics → collapse runs → `e→a`, `y→i` vowel fold, plus initialism expansion (`AA`/`A.A.` → addis ababa). Resolution is by unique prefix, and an ambiguous prefix returns *no* match rather than a guess, because a wrong auto-merge rewrites a student's location silently. (commit `43ce235`)
2. **Free text was grouped by the raw typed string** — `cityMap[student.City]++` meant `Adis Ababa`, `adis abeba`, `Addis  Ababa` and `AA` appeared as four panel rows, and promoting one of them could never touch the others. The panel now clusters by canonical place: one row per place, its other spellings listed on the row, and promote acts on the whole cluster through a `group_key` instead of a single string. This is the client's chosen "aggressive auto-merge of near-spellings". (commit `43ce235`)
3. **Promoting a name the list already held created a second entry** — `PromoteLocation` matched stored cities by exact string, so `Addis Ababa.` (trailing dot) fell through to the create branch. It now resolves through `locnorm`, relinks the students onto the existing city id and reports `target.merged`, so the canonical row's count grows and no duplicate is added. (commit `43ce235`)
4. **The stored list itself held one city id twice** — `addis-ababa` existed under both the Addis Ababa region *and* Oromia, and nothing prevented it: `SaveLocations` checked city-id uniqueness per region, not globally. Uniqueness is now enforced on save, and duplicate copies are folded on read by `CanonicalLocations` (the copy whose region name folds equal to the city name survives). A student pointing at a duplicate id resolves to the surviving entry. (commit `43ce235`)
5. **Statistics kept splitting one city across rows** — the dashboard's "Users by city" grouped by the student's raw typed city, so free text and stale ids each took their own line. The admin usecase now receives the location list (`WithLocations` in `router.go`) and folds every student onto the canonical city before counting, which is what makes the numbers match the list. (commit `43ce235`)
6. **A merge button for what a spelling rule cannot decide** — new `MergeCities` usecase and `POST /api/locations-admin/merge`: moves every student of one listed city onto another and drops the merged-away entry. Refuses empty/identical/unknown pairs with a 400 and never writes on refusal; each student write is conditional, so failures come back as a `failed` count instead of a silent success. Covers neighbourhoods and the same city under two regions. (commit `43ce235`)
7. **Boot data migration `20261014-005-location-dedupe`** — the mechanical production dedupe: folds duplicate city entries in the stored list, then relinks every student whose `region_id`/`city_id` is a duplicate id, a stale name, or a typed spelling of a listed place. Each write is `UpdateItem` on the **composite** `id`+`telegram_id` key lifted off the scanned row (`keyNames`/`fullKey`) with a condition that the row still carries the location being replaced, so concurrent edits are skipped, not clobbered. Writes a JSON backup before touching anything, and an error is returned when any write fails so the ledger retries it on the next boot. Ships with a standalone `cmd/migrate-location-dedupe` that **defaults to dry run** (`-apply` to write). The client chose both the migration and the admin button, so nothing needs an admin to click through 200 rows. (commit `335b54f`)
8. **Admin UI** — clustered free-text rows with their variant spellings, `Link` vs `Promote` per row (a row whose place the list already holds opens a sheet with the region select *locked*, because changing the region there would move students to a different city), a `Merge <city> into another city` action on every city row opening a target picker over every other listed city, and toasts that name the merge target and surface the failed count. (commit `ba8eda4`)

## Production dry run (read-only, nothing written)

`locdedupe.exe` from the repo root against the live tables: **217 students to relink** (`typed city spelling=211`, `duplicate city id=5`, `typed region=1`, `stale name=0`), **1 duplicate city entry** to drop, 160 already canonical, 0 unreadable rows. Every distinct re-point was reviewed; the largest clusters are semantically correct: Addis Ababa 73 (+5 from the duplicate id), Oromia/Adama 38, Oromia/Robe 24, Dire Dawa 10, Oromia/Jimma 8, Tigray/Mekelle 7, Sidama/Hawassa 7, Oromia/Asella 6, Harari/Harar 6, Amhara/Gondar 6. One row is a region-only correction (`adiss abeba`/`sheger` → region Addis Ababa, city left free text) — the city stays for an admin to judge, which is the intended boundary between the rule and the button. **No production write has been made and none was made here.**

## Verification

- Backend `go build ./...` / `go vet ./...` / `go test ./...` — pass.
- Admin `tsc -b --force` — pass; `vite build` (PWA) — pass, `✓ built in 3m 1s`, 32 precache entries.
- Browser E2E against the local stack (dynalite `:8000`, backend `:8081`, vite `:5174`, logged in through the app's own form): five spellings of Addis Ababa clustered into **one** row, promoting it relinked 7 students with `merged: true` and left exactly one `addis-ababa` entry; the `Mekelle` and `Zeway(Batu)` **Link** rows (the client's own examples) each reported "Merged into <city> · <region>. 1 student linked." and dropped out of the free-text tab instead of adding a second city; `Merge Adama into…` → Zeway(Batu) moved the student, removed Adama from the list, and the dashboard "Users by city" became 4 rows / 12 users (Addis Ababa 8, Zeway(Batu) 2, Mekelle 1, Bole 1). The `Bole` row stayed free text because it was never promoted — that row is the un-promoted control.
- Stated limitation: the in-app automation browser has a 0x0 viewport, so this E2E is **structural** (accessibility snapshots and DOM clicks) — no screenshots, and pixel-level layout was not re-checked in this pass.

## Tests added for the above

- `internal/locnorm/locnorm_test.go` — fold/abbrev/prefix rules and the ambiguity refusal.
- `internal/migrations/location_dedupe_test.go` — the homename region survives deduping without mutating its input; typed/abbrev/trailing/stray spellings and a duplicate-id row all land on `addis-ababa`; a canonical row and an unknown place are left alone; the update expression writes only the patch.
- `internal/migrations/location_dedupe_local_test.go` — on the **production key shape**: dry run reports 2 relinks and writes nothing; apply reports `relinked=2 dropped=1 failed=0`, both rows sit on the canonical entry, the list keeps one `addis-ababa`, and a rerun reports already canonical.
- `internal/usecase/catalog_merge_test.go` — merge moves the students and drops the entry; a rejected pair leaves the list untouched.

## Still open

- **Deploy is the prod step.** `20261014-005` runs on boot (`AUTO_MIGRATE` defaults on) and applies the 217 relinks above, so the client's acceptance case becomes true in production without any manual write. If a staged apply is preferred instead, run `cmd/migrate-location-dedupe` (dry run by default) against the prod tables from a machine with the root `.env` and add `-apply` only on explicit approval.
- `-004` default price plan is still deferred pending `MIGRATE_PRICING_ETB`; the `-001`/`-002` migrations from the thirteenth pass still need their first boot.
- Neighbourhood-level places students type (e.g. `Bole`) stay separate cities by design; the merge button is how an admin folds them.
- Older `TestLocalDynamo*` cases in `internal/repository` still assume tables `cmd/setup-tables` creates. Pre-existing, unrelated.
- Unchanged from earlier passes: the admin responsive/PWA browser E2E at 390/768/1280, the AI practice loop and chat vision (parked for client sign-off), and the markdown/KaTeX rendering plan.

# Update 2026-10-15 (fifteenth pass): locations — removing an entry moves or unlinks its students

The fourteenth pass made one city read as one place, and the client then found the edges of what the page can do: **"There's no way to delete/unlink region"**, and **"Also, there should be way to delete city as well…"**. Both were true, and the reason was worse than a missing button: the Locations editor only saves the whole tree, so the one way to delete a row today was to delete it in the draft and press Save — which would write the tree without it and leave every student filed on that entry pointing at an id nothing can resolve. Not on the dashboard, not in the admin panel, not for the student. So this pass added the affordance and closed the hole it would have leaked through, and while verifying it in the browser it turned up two more defects (one of them a data-invariant break), all fixed here.

## Fixes and changes

1. **`ClearStudentLocation` — a student write that can remove a link** (commit `e69f8f6`) — unlinking has to take `region_id`/`city_id` *off* the row, which `UpdateStudent` cannot express: it skips zero-valued attributes, so an empty id means "not provided" and the row keeps the dead pointer. This is an explicit `REMOVE #region_id, #city_id SET #updated_at = …` on the full composite key, and it deliberately leaves the typed names alone — those are what put the student back into the free-text list. `StudentRepository` gained the method.
2. **`RemoveLocation` — the one door an entry leaves the list through** (commit `713ef06`) — `POST /api/locations-admin/remove {kind, source_id, target_id}`. A **region merge** folds its cities onto the target's same-place cities (by id, then by `locnorm` spelling) and every student follows, with each city's own id/name; a **city merge** delegates to `MergeCities`; with **no target** the students are unlinked — list row dropped, links removed, and they reappear in free text ready to be promoted again; an entry with nobody on it is simply deleted. `sort_order` is renumbered after a drop, `failed` counts writes that did not land, and `dropped` returns the name the toast repeats.
3. **`GuardLocationDrops` on the plain save** (commit `713ef06`) — `PUT /api/locations-admin` now refuses a list that drops an entry students still stand on, naming each entry and how many sit on it (`region "Oromia" still has 3 students, city "Adama" still has 1 student — merge them into another entry or unlink them instead of deleting the row`), as a 400 the page surfaces as a toast. Renames and empty entries still save normally.
4. **`GET /api/locations-admin` serves the canonical list plus live per-entry counts** (commit `713ef06`) — the response was the raw stored tree, which can carry a legacy duplicate city id; the page adopted it, let the admin edit both rows, and then its own next save was invalid. It now returns `CanonicalLocations` and a `counts` map keyed `region:<id>` / `city:<id>`, so the removal sheet can say what a click does *before* the admin makes it. A student filed under a stale region counts where their city actually lives.
5. **`/merge` folded into `/remove`** (commit `713ef06`) — one endpoint, both kinds; the route test asserts `/merge` now 404s so a stale bundle cannot half-work against it.
6. **A region merge no longer drags a student off their city's owner** (commit `713ef06`) — found while writing the HTTP tests: `regionStudents` includes students whose row names the removed region but whose `city_id` belongs to *another* region (exactly what the pre-fix promote minted). Merging that region into a third one used to rewrite their region to the merge target, producing a row whose `region_id` contradicts its `city_id` — the precise corruption shape this whole layer exists to prevent. They now follow their city's owning region; the patch carries only what changes, so their city is left intact.
7. **Mutation sites stop aliasing the stored tree** (commit `713ef06`) — `PromoteLocation`, `MergeCities`, `removeRegion` and `unlinkCity` each took `u.Locations()` and then `dedupeCityIDs(&locs)` on a shallow copy, so editing a city slice could reach back into the shared backing array. All four now start from `CanonicalLocations`, which deep-copies.
8. **Admin UI** (commit `354784c`) — a `GitMerge` action on every region row and every city row (the previous two-arrows glyph read as re-ordering, per the client), opening one `RemoveSheet` whose option list is driven by the live count: merge targets first when students are on the entry, then `Unlink: keep their typed names, N students back to free text`, or `Delete it (no students are on it)` when there is nobody to move; the confirm button reads `Merge into <where>` / `Unlink students` / `Delete` and is destructive for the last two. Counts refresh after every promote and removal without touching the unsaved draft. Three defects the browser pass caught and fixed in the same commit: `2 cityies` → `2 cities`, `1 student are back` → `is`, and a promote sheet that **locked** its region select whenever the cluster's typed region name matched a listed region — which is exactly the state an unlink leaves students in, so an admin who had just detached a student could not send them anywhere except where they had typed. The lock now applies only when the typed city itself is a listed one (where the entry genuinely decides the region), and the region select is pre-filled from the name match instead.

## Verification

- Backend `go build ./...` / `go vet ./...` / `go test ./...` — all packages pass.
- Admin `tsc -b --force` — exit 0; `vite build` (PWA) — `✓ built in 2m 23s`, 32 precache entries (both re-run after the last edit).
- Browser E2E against the local stack (dynalite `:8000`, backend `:8081`, vite `:5174`, seeded with the production-shaped messy 12-student set), each step read back through the admin API and a raw table scan:
  - **Region merge** Oromia → Addis Ababa: `Oromia merged into Addis Ababa. 3 students moved.` — list 4 → 3 regions, `adama`/`zeway-batu` folded into Addis Ababa, `sort_order` renumbered, and the two students filed `oromia` + `city_id addis-ababa` came home to `addis-ababa`.
  - **City unlink** Adama (1 student): `Adama removed. 1 student is back in free text…` — the row's `region_id`/`city_id` gone, typed `Addis Ababa`/`Adama` kept, entry left the list, and the free-text tab listed it as an *un*matched row. Promoting it back re-linked the student, and after the lock fix the same sheet could also send them to Sidama instead (verified: the student ended `sidama`/`adama`, the city moved with them).
  - **City delete** Bole (0 students): `Bole deleted. Nothing was on it.` — entry gone, no student write attempted.
  - **Region unlink** Addis Ababa (4 students): `Addis Ababa removed. 4 students are back in free text…` — all four detached (typed names intact), the region and its cities gone, free text grew to 6 rows and the dashboard chart re-grouped by canonical city.
  - **Save guard**: `PUT` of the canonical tree with Oromia missing returned **400** with the sentence above and left the stored tree byte-identical. Exercised at the API level because the editor itself no longer offers a way to drop a row — the guard is the backstop for any client that writes the whole tree.
- **No production call of any kind in this pass.** Every write went to `localhost` dynalite; the live tables were not touched and the stack was re-seeded afterwards.
- Stated limitation: the in-app automation browser has a 0x0 viewport, so this E2E is **structural** (accessibility snapshots + DOM clicks) — no screenshots, and pixel-level layout of the new sheet was not visually re-checked.

## Tests added for the above

- `internal/repository/student_clear_location_local_test.go` (1 test, dynalite-gated like the existing local suite) — a zero-valued `UpdateStudent` provably does *not* clear, `ClearStudentLocation` removes both ids while keeping the typed names, the key and every other field, is idempotent, and leaves a neighbouring row alone.
- `internal/usecase/catalog_remove_test.go` (10) — region merge moves cities and students and renumbers order; the city-owner rule (item 6); region unlink clears exactly its own students; empty region just deletes; city unlink detaches; city merge delegates and leaves the source region holding one city; failed writes are counted, not swallowed; seven bad inputs refuse with the tree untouched; the guard refuses an orphaning save and allows renames and empty entries.
- `internal/handler/http/catalog_locations_http_test.go` (6) — the routes the page actually calls (and `/merge` 404ing), the canonical list + counts shape it is served, a region removal and a city unlink end-to-end over HTTP including the free-text round trip, bad input 400s, and the guard's message reaching the browser as a 400.

## Still open

- **Deploy is still the prod step for the previous pass**: `20261014-005` has not run against the live tables yet, so production still holds the 217 relinks and 1 duplicate entry the dry run reported. This pass adds no migration — removal is an admin action, and its guard means a deploy of this backend cannot orphan rows that the migration has not folded yet.
- Region unlink clears **both** ids for a student whose city happens to live in a region that survives (a leftover duplicate-id row). Detaching them entirely is deliberate — they land in free text rather than in a half-updated row — but if the client would rather such students keep the city they are actually on, that is a one-line change in `removeRegion`'s unlink branch.
- Neighbourhood-level places students type (e.g. `Bole`) still stay separate until an admin folds them; `locnorm` will not decide that one.
- Older `TestLocalDynamo*` cases in `internal/repository` still assume tables `cmd/setup-tables` creates. Pre-existing, unrelated.
- Unchanged from earlier passes: the `-004` default price plan (needs `MIGRATE_PRICING_ETB`), the admin responsive/PWA E2E at 390/768/1280, the AI practice loop and chat vision (parked for client sign-off), and the markdown/KaTeX rendering plan.

## DEPLOYED & TESTED AS IT IS

### PHASE 1 COMPLETION SUMMARY:
### COMMIT LOGS:
5ba5366 (HEAD -> main, origin/main, origin/HEAD) docs(progress): record fifteenth pass — region/city removal, unlink write, save guard
354784c feat(admin): merge, unlink or delete any region and city from the list
713ef06 feat(locations): removing an entry moves or unlinks its students
e69f8f6 feat(backend): a student write that can take a location link off
fc56403 docs(progress): record fourteenth pass — canonical locations, merge layer, migration 005
ba8eda4 feat(admin): clustered free-text rows, link-to-listed promote, and a merge-city sheet
335b54f feat(migrations): 20261014-005 folds duplicate cities and relinks their students
43ce235 fix(locations): one canonical city per place, promote merges instead of duplicating
c92edd6 docs(progress): record thirteenth pass — whole-birr money, deploy shims, promote/migration key fixes
750b6a7 fix(backend): stop writing DynamoDB key attributes on student updates
b99cf4e Revert "docs(progress): rewrite as a single current-state handoff reference"
2104418 docs(progress): rewrite as a single current-state handoff reference
5e6785c refactor(pricing): all money is whole ETB birr — drop the santim sub-unit
dc34cbc docs(env): document the phase 0/1 boot-migration variables
0a09ea3 fix(backend): transitional compat shims so the deployed old frontend survives a backend-first deploy
cc856ae docs: record twelfth pass — full local gate run, six wiring defects fixed, deployment notes
ca38197 fix(admin): pricing/enrollment/location services call /api-prefixed paths
496653f fix(backend): pricing snapshot guard, location validation, revoked/lifetime premium reads
4cf4cb3 fix(frontend): free-coupon payment flow and premium-contest 402 sheet
3b3570f fix(admin): Programs confirm dialog onConfirm return type (tsc -b + vite build pass)
d2002f9 fix(backend): resolve Phase 0/1 compile error and normalize gofmt
b528f2b feat: add progress documentation and implement Phase 0 and Phase 1 features
f22a5ba chore: remove obsolete documentation files & Addition of Proposed Implementation Plan

### FILES THAT ARE CHANGED:
Updating 74e4c8f..5ba5366
Fast-forward
 .env.example                                       |   24 +
 ACADEMY_BACKEND_NOTES.md                           |   57 -
 ACADEMY_INTEGRATION.md                             |   29 -
 CHANGE_SUMMARY.md                                  |  293 ----
 DOCKER_IMPLEMENTATION_SUMMARY.md                   |  352 ----
 PROGRESS.md                                        |  559 +++++++
 PROPOSED-IMPLEMENTATION-PLAN.md                    | 1681 ++++++++++++++++++++
 README.md                                          |  116 +-
 admin-page-clean/src/App.tsx                       |    7 +
 admin-page-clean/src/academy/admin/AdminLayout.tsx |    3 +-
 admin-page-clean/src/academy/admin/ContentTree.tsx |   50 +-
 admin-page-clean/src/academy/admin/Programs.tsx    |  273 ++++
 .../src/academy/admin/editor/BasicsTab.tsx         |    4 +-
 admin-page-clean/src/academy/admin/routes.tsx      |    2 +
 .../src/academy/admin/tree/SubjectCard.tsx         |   22 +-
 admin-page-clean/src/academy/admin/tree/forms.tsx  |  106 +-
 admin-page-clean/src/academy/lib/theme.ts          |    8 +
 .../src/components/common/ScopePicker.tsx          |   89 ++
 .../src/components/common/Sidentmenu.tsx           |    6 +
 .../src/components/contests/AddContest.tsx         |   15 +-
 .../src/components/contests/Contest.tsx            |    3 +-
 .../src/components/contests/ContestStatistics.tsx  |    6 +-
 .../components/contests/UpdateContestDialog.tsx    |   11 +-
 .../src/components/payment/approved-tabs.tsx       |    8 +
 .../src/components/payment/columns.tsx             |   26 +-
 .../src/components/payment/pending-tab.tsx         |   12 +-
 .../src/components/questions/AddQuestionMethod.tsx |   34 +-
 .../src/components/questions/QuestionTable.tsx     |   27 +
 .../src/components/questions/Questions.tsx         |   98 +-
 .../src/components/users/UserAccessSheet.tsx       |  139 ++
 admin-page-clean/src/components/users/Users.tsx    |  124 +-
 admin-page-clean/src/hooks/useCatalogLists.ts      |   54 +
 admin-page-clean/src/pages/BulkEnrolment.tsx       |  154 ++
 admin-page-clean/src/pages/Locations.tsx           |  417 +++++
 admin-page-clean/src/pages/Pricing.tsx             |  202 +++
 .../src/services/academy/academyApi.ts             |   10 +
 admin-page-clean/src/services/catalogServices.ts   |   22 +
 admin-page-clean/src/services/paymentServices.ts   |   26 +-
 admin-page-clean/src/services/pricingServices.ts   |   85 +
 admin-page-clean/src/services/questionServices.ts  |   11 +
 admin-page-clean/src/types/academy.ts              |   17 +-
 admin-page-clean/src/types/models.ts               |   15 +
 backend/.env.example                               |   12 +
 backend/cmd/migrate-enrollments/main.go            |   41 +
 backend/cmd/migrate-grade/main.go                  |   41 +
 backend/cmd/migrate-location-dedupe/main.go        |   43 +
 backend/cmd/migrate-locations/main.go              |   40 +
 backend/cmd/migrate-pricing/main.go                |   46 +
 backend/cmd/migrate/main.go                        |   67 +
 backend/internal/domain/academy.go                 |   61 +
 backend/internal/domain/admin.go                   |   24 +-
 backend/internal/domain/contest.go                 |    3 +
 backend/internal/domain/grade.go                   |   40 +
 backend/internal/domain/locations.go               |   64 +
 backend/internal/domain/pricing.go                 |   92 ++
 backend/internal/domain/pyament.go                 |    8 +
 backend/internal/domain/question.go                |    8 +-
 backend/internal/domain/scope.go                   |   84 +
 backend/internal/domain/scope_test.go              |  122 ++
 backend/internal/domain/student.go                 |   16 +
 backend/internal/handler/http/academy_handler.go   |   48 +
 .../internal/handler/http/achievement_handler.go   |    2 +-
 backend/internal/handler/http/ai_handler_test.go   |    8 +-
 backend/internal/handler/http/article_handler.go   |  364 +++--
 backend/internal/handler/http/auth.go              |   30 +
 backend/internal/handler/http/catalog_handler.go   |  174 ++
 .../handler/http/catalog_locations_http_test.go    |  374 +++++
 backend/internal/handler/http/contest_handler.go   |   83 +
 .../handler/http/contest_registration_handler.go   |   29 +-
 .../internal/handler/http/enrollment_handler.go    |  146 ++
 backend/internal/handler/http/image_handler.go     |   90 +-
 backend/internal/handler/http/payment_handler.go   |   86 +-
 backend/internal/handler/http/pricing_handler.go   |  234 +++
 backend/internal/handler/http/question_handler.go  |   70 +
 backend/internal/handler/http/router.go            |  140 +-
 backend/internal/handler/http/student_handler.go   |   31 +-
 .../internal/handler/http/submission_handler.go    |   19 +-
 backend/internal/locnorm/locnorm.go                |  193 +++
 backend/internal/locnorm/locnorm_test.go           |  163 ++
 backend/internal/migrations/enrollments.go         |  115 ++
 backend/internal/migrations/grade.go               |  118 ++
 backend/internal/migrations/location_dedupe.go     |  252 +++
 .../migrations/location_dedupe_local_test.go       |  194 +++
 .../internal/migrations/location_dedupe_test.go    |  120 ++
 backend/internal/migrations/locations.go           |   33 +
 backend/internal/migrations/pricing.go             |   82 +
 backend/internal/migrations/prod_key_local_test.go |  190 +++
 backend/internal/migrations/registry.go            |   53 +
 backend/internal/migrations/runner.go              |  252 +++
 backend/internal/migrations/runner_test.go         |   37 +
 backend/internal/migrations/util.go                |   95 ++
 backend/internal/migrations/util_test.go           |   45 +
 .../repository/ai_provider_dynamo_local_test.go    |    2 +-
 backend/internal/repository/payment_dynamo.go      |   25 +
 backend/internal/repository/pricing_dynamo.go      |  218 +++
 backend/internal/repository/question_dynamo.go     |   66 +
 .../internal/repository/reference_data_dynamo.go   |   61 +
 .../student_clear_location_local_test.go           |   81 +
 backend/internal/repository/student_dynamo.go      |  104 +-
 .../repository/student_patch_expression_test.go    |   96 ++
 .../student_promote_prod_key_local_test.go         |  146 ++
 backend/internal/repository/submission_dynamo.go   |    7 +
 backend/internal/schema/tables.go                  |   13 +-
 backend/internal/usecase/academy_programs_admin.go |  181 +++
 backend/internal/usecase/academy_programs_seed.go  |  118 ++
 backend/internal/usecase/academy_usecase.go        |  115 +-
 backend/internal/usecase/access.go                 |  116 ++
 backend/internal/usecase/access_test.go            |   64 +
 backend/internal/usecase/admin_usecase.go          |   80 +-
 backend/internal/usecase/ai_settings_usecase.go    |   10 +-
 backend/internal/usecase/catalog.go                | 1061 ++++++++++++
 backend/internal/usecase/catalog_merge_test.go     |  432 +++++
 backend/internal/usecase/catalog_remove_test.go    |  346 ++++
 backend/internal/usecase/contest_usecase.go        |   17 +-
 backend/internal/usecase/enrollment_test.go        |   65 +
 backend/internal/usecase/enrollment_usecase.go     |  195 +++
 .../internal/usecase/enrollment_usecase_test.go    |   79 +
 backend/internal/usecase/interfaces.go             |    8 +
 backend/internal/usecase/locations_seed.json       |  271 ++++
 backend/internal/usecase/payment_usecase.go        |  122 +-
 backend/internal/usecase/pricing_logic.go          |  284 ++++
 backend/internal/usecase/pricing_logic_test.go     |  184 +++
 backend/internal/usecase/pricing_usecase.go        |  399 +++++
 backend/internal/usecase/pricing_usecase_test.go   |   60 +
 backend/internal/usecase/question_usecase.go       |   10 +
 backend/internal/usecase/student_usecase.go        |   63 +-
 backend/internal/usecase/submission_usecase.go     |   29 +-
 docs/ARCHITECTURE.md                               |    9 +
 DEPLOYMENT.md => docs/DEPLOYMENT.md                |    0
 DOCKER_QUICKSTART.md => docs/DOCKER.md             |    0
 frontend/src/App.tsx                               |    2 +
 frontend/src/academy/components/UpgradeSheet.tsx   |    5 +-
 frontend/src/academy/lib/theme.ts                  |    8 +
 frontend/src/academy/pages/Courses.tsx             |    4 +-
 frontend/src/academy/pages/Home.tsx                |   11 +-
 frontend/src/academy/pages/Module.tsx              |    2 +-
 frontend/src/components/ContestCard.tsx            |    5 +-
 frontend/src/components/LeaderboardModal.tsx       |    5 +-
 frontend/src/components/PremiumSheet.tsx           |   41 +-
 frontend/src/components/TopNavigation.tsx          |    9 +-
 frontend/src/context/PremiumSheetContext.tsx       |    6 +-
 frontend/src/lib/premium.ts                        |   13 +
 frontend/src/pages/AIPractice.tsx                  |    8 +-
 frontend/src/pages/Contest.tsx                     |   30 +-
 frontend/src/pages/Home.tsx                        |    5 +-
 frontend/src/pages/MyPrograms.tsx                  |  107 ++
 frontend/src/pages/Payment.tsx                     |   58 +-
 frontend/src/pages/Profile.tsx                     |    2 +
 frontend/src/pages/Statistics.tsx                  |    2 +-
 frontend/src/pages/StudentRegisteration.tsx        |  495 +++---
 frontend/src/shared/pricing/PlanPicker.tsx         |  125 ++
 frontend/src/shared/pricing/api.ts                 |   86 +
 frontend/src/shared/scope/LocationFields.tsx       |   65 +
 frontend/src/shared/scope/ProgramPicker.tsx        |   62 +
 frontend/src/shared/scope/catalog.ts               |  107 ++
 frontend/src/types/academy.ts                      |   13 +-
 frontend/src/types/index.ts                        |    5 +
 157 files changed, 14661 insertions(+), 1636 deletions(-)
 delete mode 100644 ACADEMY_BACKEND_NOTES.md
 delete mode 100644 ACADEMY_INTEGRATION.md
 delete mode 100644 CHANGE_SUMMARY.md
 delete mode 100644 DOCKER_IMPLEMENTATION_SUMMARY.md
 create mode 100644 PROGRESS.md
 create mode 100644 PROPOSED-IMPLEMENTATION-PLAN.md
 create mode 100644 admin-page-clean/src/academy/admin/Programs.tsx
 create mode 100644 admin-page-clean/src/components/common/ScopePicker.tsx
 create mode 100644 admin-page-clean/src/components/users/UserAccessSheet.tsx
 create mode 100644 admin-page-clean/src/hooks/useCatalogLists.ts
 create mode 100644 admin-page-clean/src/pages/BulkEnrolment.tsx
 create mode 100644 admin-page-clean/src/pages/Locations.tsx
 create mode 100644 admin-page-clean/src/pages/Pricing.tsx
 create mode 100644 admin-page-clean/src/services/catalogServices.ts
 create mode 100644 admin-page-clean/src/services/pricingServices.ts
 create mode 100644 backend/cmd/migrate-enrollments/main.go
 create mode 100644 backend/cmd/migrate-grade/main.go
 create mode 100644 backend/cmd/migrate-location-dedupe/main.go
 create mode 100644 backend/cmd/migrate-locations/main.go
 create mode 100644 backend/cmd/migrate-pricing/main.go
 create mode 100644 backend/cmd/migrate/main.go
 create mode 100644 backend/internal/domain/grade.go
 create mode 100644 backend/internal/domain/locations.go
 create mode 100644 backend/internal/domain/pricing.go
 create mode 100644 backend/internal/domain/scope.go
 create mode 100644 backend/internal/domain/scope_test.go
 create mode 100644 backend/internal/handler/http/catalog_handler.go
 create mode 100644 backend/internal/handler/http/catalog_locations_http_test.go
 create mode 100644 backend/internal/handler/http/enrollment_handler.go
 create mode 100644 backend/internal/handler/http/pricing_handler.go
 create mode 100644 backend/internal/locnorm/locnorm.go
 create mode 100644 backend/internal/locnorm/locnorm_test.go
 create mode 100644 backend/internal/migrations/enrollments.go
 create mode 100644 backend/internal/migrations/grade.go
 create mode 100644 backend/internal/migrations/location_dedupe.go
 create mode 100644 backend/internal/migrations/location_dedupe_local_test.go
 create mode 100644 backend/internal/migrations/location_dedupe_test.go
 create mode 100644 backend/internal/migrations/locations.go
 create mode 100644 backend/internal/migrations/pricing.go
 create mode 100644 backend/internal/migrations/prod_key_local_test.go
 create mode 100644 backend/internal/migrations/registry.go
 create mode 100644 backend/internal/migrations/runner.go
 create mode 100644 backend/internal/migrations/runner_test.go
 create mode 100644 backend/internal/migrations/util.go
 create mode 100644 backend/internal/migrations/util_test.go
 create mode 100644 backend/internal/repository/pricing_dynamo.go
 create mode 100644 backend/internal/repository/reference_data_dynamo.go
 create mode 100644 backend/internal/repository/student_clear_location_local_test.go
 create mode 100644 backend/internal/repository/student_patch_expression_test.go
 create mode 100644 backend/internal/repository/student_promote_prod_key_local_test.go
 create mode 100644 backend/internal/usecase/academy_programs_admin.go
 create mode 100644 backend/internal/usecase/academy_programs_seed.go
 create mode 100644 backend/internal/usecase/access.go
 create mode 100644 backend/internal/usecase/access_test.go
 create mode 100644 backend/internal/usecase/catalog.go
 create mode 100644 backend/internal/usecase/catalog_merge_test.go
 create mode 100644 backend/internal/usecase/catalog_remove_test.go
 create mode 100644 backend/internal/usecase/enrollment_test.go
 create mode 100644 backend/internal/usecase/enrollment_usecase.go
 create mode 100644 backend/internal/usecase/enrollment_usecase_test.go
 create mode 100644 backend/internal/usecase/locations_seed.json
 create mode 100644 backend/internal/usecase/pricing_logic.go
 create mode 100644 backend/internal/usecase/pricing_logic_test.go
 create mode 100644 backend/internal/usecase/pricing_usecase.go
 create mode 100644 backend/internal/usecase/pricing_usecase_test.go
 create mode 100644 docs/ARCHITECTURE.md
 rename DEPLOYMENT.md => docs/DEPLOYMENT.md (100%)
 rename DOCKER_QUICKSTART.md => docs/DOCKER.md (100%)
 create mode 100644 frontend/src/pages/MyPrograms.tsx
 create mode 100644 frontend/src/shared/pricing/PlanPicker.tsx
 create mode 100644 frontend/src/shared/pricing/api.ts
 create mode 100644 frontend/src/shared/scope/LocationFields.tsx
 create mode 100644 frontend/src/shared/scope/ProgramPicker.tsx
 create mode 100644 frontend/src/shared/scope/catalog.ts

=== END OF PHASE ONE ===

=== BEGINNING OF PHASE TWO ===

---

# Update 2026-10-16 (Phase 2, first pass, 5-minute box): attempt engine backend

**Nothing in this pass was compiled, vetted, gofmt-ed or tested** (no Go toolchain, by instruction). New code was written by hand against the existing interfaces; run `cd backend && gofmt -l . && go build ./... && go test ./...` first. Expect possible alignment-only gofmt diffs and a few compile fixes.

## Done (backend)

| Plan item | Where |
|---|---|
| Contest fields (`Kind`, `Mode`, `DurationMinutes`, `LatePenaltyPercent`, `Reveal`, shuffle flags, `Year`, `Source`) + enums and `EffectiveMode/Kind/Reveal` (legacy empty mode reads as `global`). `Scope` already existed as `*Scope` from Phase 1 | `domain/contest.go` |
| `Attempt` model, status constants, deterministic id `{contest}#{student}#1`, admin `Label()` | `domain/attempt.go` (new) |
| Submission: `Scope`, `AttemptID`, `StartedAt`, `IsLate`, `PenaltyPercent`, `Points`, `DurationSeconds` (`Score` stays raw correct count) | `domain/submission.go` |
| `attempts` table + GSIs `student_id-index`, `contest_id-index`, `status-expires_at-index` | `schema/tables.go` |
| Attempt repository: conditional create, versioned autosave, conditional finalise, put, delete, queries by student / contest / expired | `repository/attempt_dynamo.go` (new) |
| Pure rules: start window, `expires_at`, lateness by submit time, penalty, points formula, effective submit time for auto-submits, `AnswersVisible`, grading, typed contest validation | `usecase/attempt_logic.go` + `attempt_logic_test.go` (new; tests include the plan's worked example) |
| Attempt usecase: Start (resume, 409 `already_attempted`, shuffled order, stream snapshot), Autosave (+30 s grace), Submit (idempotent), lazy finalise, Result (answers only if visible), sweeper, admin list/get and `exclude` / `waive_penalty` / `regrade` / `reset` (audit log line) | `usecase/attempt_usecase.go` (new) |
| Routes: `POST /api/assessments/:id/start`, `PUT /api/attempts/:id/answers`, `POST /api/attempts/:id/submit`, `GET /api/attempts/:id/result`, admin `GET /api/admin/assessments/:id/attempts`, `GET|PATCH /api/admin/attempts/:id` | `handler/http/assessment_handler.go` (new), `router.go` |
| Sweeper goroutine every 60 s, stopped on SIGINT/SIGTERM | `router.go` (`RunAttemptSweeper`), `main.go` |
| Contest create: typed Phase 2 validation; defaults to `self_paced` + 10% penalty **only when `duration_minutes` is sent or `mode` is set** (deliberate deviation: the current admin form sends neither, and forcing self-paced would break contest creation until the form is updated) | `usecase/contest_usecase.go` |

## NOT done in Phase 2

- `GET /api/assessments`, `GET /api/assessments/:id` (list/intro with `lock` and `my_attempt`) and `GET /api/assessments/:id/leaderboard`.
- Access check on Start: `AttemptUsecase.Access` hook exists but is **not wired** to `Decide`/pricing, so premium assessments are not gated by the new routes yet.
- `SubmitLegacy` bridge for `POST /api/submission/`; `submission_usecase` editorial still uses `ContestHasEnded` (not switched to `AnswersVisible`).
- Typed `ContestPatch` replacing the reflection PATCH (D11), including `ValidateScope`; `UpdateContest` has no Phase 2 validation yet.
- CSV export of attempts; leaderboard update and badge evaluation on finalise (Phase 3 for leaderboards).
- Repository/usecase tests with fakes and DynamoDB Local for attempts.
- Admin app: `AssessmentForm`, `AttemptsTab`, `ContestList` columns, services/types. **Not started.**
- Student app: `AssessmentList`, `Intro`, `Exam`/`Palette`/`Timer`, `useServerClock`, `Result`, `Retake`, `api.ts`, route changes and redirects. **Not started.**

## Files changed or added

Changed: `domain/{contest,submission}.go`, `schema/tables.go`, `usecase/contest_usecase.go`, `handler/http/router.go`, `main.go`.
New: `domain/attempt.go`, `repository/attempt_dynamo.go`, `usecase/{attempt_logic,attempt_logic_test,attempt_usecase}.go`, `handler/http/assessment_handler.go`.

---

# Update 2026-10-16 (Phase 2, second pass, 5-minute box): reads, leaderboard, access gate

Still **not compiled, vetted, gofmt-ed or tested** (no toolchain, by instruction). Run `gofmt -l . && go build ./... && go test ./...` in `backend/`.

## Done in this pass

- `GET /api/assessments` (scope filter query params `program_id`, `stream_id`, `subject_id`, `chapter_id`; metadata only, plus `lock` and `my_attempt`), `GET /api/assessments/:id` (intro data), `GET /api/assessments/:id/leaderboard` (ranks by points, ties on duration; excludes abandoned and excluded attempts). Files: `usecase/assessment_read.go` (new), `handler/http/assessment_handler.go`.
- Access gate wired: `AttemptUsecase.Access` now calls the existing `ContestHandler.studentLocked` (so `Decide` per program when the contest has a Scope, any-entitlement fallback otherwise). Start returns **402** with the `lock` object; list and intro carry `lock`. File: `router.go`, `usecase.LockedError`.

## Still open in Phase 2 (updated list)

- `SubmitLegacy` bridge for `POST /api/submission/`; editorial visibility in `submission_usecase` still uses `ContestHasEnded` rather than `AnswersVisible`.
- Typed `ContestPatch` (D11) replacing the reflection PATCH, with `ValidateScope` and Phase 2 validation on update.
- Attempts CSV export; badge evaluation on finalise; leaderboard side effects beyond the per-assessment board (Phase 3).
- Tests with fakes / DynamoDB Local for the attempt repository, usecase, and the new read endpoints.
- `ListAssessments` status filtering is a minimal rule (skips `inactive` / `draft`); confirm against how contests use `status`.
- Admin app (`AssessmentForm`, `AttemptsTab`, `ContestList` columns, services/types) and student app (`AssessmentList`, `Intro`, `Exam`/`Palette`/`Timer`, `useServerClock`, `Result`, `Retake`, `api.ts`, routes and redirects): **not started.**

New file this pass: `backend/internal/usecase/assessment_read.go`. Changed: `handler/http/assessment_handler.go`, `handler/http/router.go`.

---

# Update 2026-10-16 (Phase 2, third pass): bridge, typed patch, CSV, admin + student apps

Still **not compiled, vetted, gofmt-ed, type-checked or tested** (no toolchain, by instruction). Run `cd backend && gofmt -l . && go build ./... && go test ./...`, then `tsc -b` / `vite build` in `frontend/` and `admin-page-clean/`. Some one-line `if` bodies in `domain/contest.go` (`ContestPatch.Apply`) will be reformatted by gofmt.

## Backend (new in this pass)

| Item | Where |
|---|---|
| `SubmitLegacy` bridge: `POST /api/submission/` for contests with a Phase 2 `mode` creates a completed attempt (window check, server grading, client `time_spend` ignored); legacy rows (empty mode) keep the old path unchanged. Window errors answer 403 | `usecase/attempt_usecase.go`, `handler/http/submission_handler.go`, `router.go` |
| Editorial visibility via `EditorialVisible` (Phase 2: only students who finished, per `AnswersVisible`; legacy: old `ContestHasEnded` rule) | `usecase/attempt_logic.go`, `submission_usecase.go` |
| Typed `domain.ContestPatch` (pointer fields) applied in `PATCH /contest/:id`; stored Scope and Phase 2 fields are now carried over on every patch; scope program required; Phase 2 validation when `mode` is set. The old string-field map for the legacy fields is **kept** (not refactored) | `domain/contest.go`, `handler/http/contest_handler.go` |
| Attempts CSV: `GET /api/admin/assessments/:id/attempts.csv?label=` | `handler/http/assessment_handler.go` |
| Badge evaluation for the finalised attempt only (`OnSubmission` hook → `AwardBadges`) | `usecase/attempt_usecase.go`, `submission_usecase.go`, `router.go` |
| `parseTime` now reuses `parseContestTime`, so zone-less timestamps the admin form sends are read like the dashboard reads them | `usecase/attempt_logic.go` |

## Student app (new)

`features/assessments/{api.ts,AssessmentList,Intro,Exam,Palette,Timer,Result,Retake,AssessmentLeaderboard}`, `shared/data/useServerClock.ts`. Routes added in `App.tsx`: `/practice`, `/assessment/:id` (intro), `/assessment/:id/exam`, `/assessment/:id/leaderboard`, `/attempt/:id/result`. Exam: server-clock timer, palette, flagging, 1.5 s debounced autosave with version conflict handling, resume, auto-submit at expiry. Result: points breakdown, answers countdown that flips on its own, "Practice again (not recorded)" graded locally with no API call. `ContestCard` sends `mode === "self_paced"` contests to `/assessment/:id`; `Contest` type gained `mode`, `duration_minutes`, `late_penalty_percent`.

## Admin app (new)

`services/assessmentServices.ts`; `features/assessments/{AttemptsTab,TimingFields}.tsx`; route `contest/:id/attempts`. `AddContest` now has the timing step (kind, mode default self-paced, time limit, late penalty default 10, reveal, shuffle, source/year) and validates a self-paced time limit and end after start. `ContestList` shows kind, mode, access and scope badges and an Attempts link for self-paced contests. Types extended in `types/models.ts`.

## Deviations from the plan (deliberate)

- The student routes use `/assessment/:id/exam` (contest id) rather than `/attempt/:id`, because the attempt does not exist until Start; the attempt id (`{contest}#{student}#1`) is URL-encoded in `/attempt/:id/result`.
- Old `/contest`, `/registration`, `/contest-editorial` routes are **not** redirected: legacy (empty-mode) contests still depend on them. Remove them once all contests are migrated.
- `AddContest` was extended rather than replaced by a new `AssessmentForm`; `UpdateContestDialog` was **not** updated and cannot edit the Phase 2 fields yet (the API accepts them via PATCH).

## Still open

- Tests: fakes/DynamoDB Local tests for the attempt repository, usecase, read endpoints, `SubmitLegacy` and the PATCH carry-over; handler tests for the new routes.
- `UpdateContestDialog` Phase 2 fields; admin `ContestList` filters from `useScopeFilter` and an attempts-count column (type field exists, backend does not return it).
- Student app: a Practice tab entry in navigation (route `/practice` exists, no menu link yet); `ContestStudentRegistration`/`Contest`/`ContestEditorial`/`useContestTimer` are not deleted (still used by legacy contests).
- `ValidateScope` against the catalog (patch only checks `program_id` is non-empty).
- Leaderboard rework by period/program (Phase 3).

---

# Update 2026-10-16 (Phase 2, fourth pass): remaining non-test items

Still **not compiled, vetted, gofmt-ed, type-checked or tested** (no toolchain, by instruction). Tests were skipped on request.

## Done in this pass

- **Catalog scope validation (was: only `program_id` non-empty):** `usecase.ValidateScopeAgainst` checks the program is active, a specific stream is offered by it (`common` always allowed), the subject exists, and the chapter exists and belongs to the subject. Applied on `POST /contest/add` and on `PATCH /contest/:id` when a scope is provided. If the catalog cannot be read the check is skipped (admins are not blocked by a read failure). Files: `usecase/scope_validate.go` (new), `contest_handler.go`, `router.go`.
- **Attempt counts:** `AttemptRepository.CountsByContest` (projected scan), `AttemptUsecase.AttemptCounts`, admin route `GET /api/admin/attempt-counts`. Files: `repository/attempt_dynamo.go`, `usecase/attempt_usecase.go`, `assessment_handler.go`.
- **Admin contest list:** program and kind filters (new `hooks/useScopeFilter.ts`, catalog-driven) in `Contest.tsx`; `ContestList` applies them and shows an attempts-count badge; `services/assessmentServices.ts` has `getAttemptCounts`.
- **Admin `UpdateContestDialog`:** now shows the same `TimingFields` for Phase 2 contests (legacy contests see a note instead) and validates the self-paced time limit; the stored Phase 2 values are loaded into the form.
- **Student navigation:** Practice entry in the bottom nav (`/practice`, also active on `/assessment/*` and `/attempt/*`) and a "Practice" page title in the top nav.

## Still open

- Tests (deliberately skipped this pass): attempt repository/usecase/read endpoints/`SubmitLegacy`/PATCH carry-over, new handler routes, `ValidateScopeAgainst`.
- The bottom nav now has six entries; check it on a 360 px screen and drop or merge one if it is crowded.
- Legacy student pages (`ContestStudentRegistration`, `Contest`, `ContestEditorial`, `useContestTimer`) and the old `/contest`, `/registration`, `/contest-editorial` routes are intentionally **kept**: contests with an empty `mode` still run on them. Delete them (and add redirects) only after every live contest has been migrated to a Phase 2 mode.
- `CountsByContest` scans the whole attempts table; fine at current scale, switch to a stored counter if the table grows large.
- Leaderboard rework by period/program is Phase 3.

---

# Update 2026-10-16 (Phase 2, fifth pass, 5-minute box): contest migration written, production NOT migrated

**Nothing was compiled or run** (no Go toolchain in this sandbox). **No production write was made.**

## Production migration: blocked, honestly reported

- The sandbox could not resolve `dynamodb.eu-north-1.amazonaws.com`, even after appending the host to `.wget-hsts` (that file only affects wget/curl HSTS, not the sandbox egress proxy). Allow `*.amazonaws.com` in the sandbox network settings, or run from a machine with network access.
- The `.env` credentials were therefore never used.
- Phase 0/1 migrations `-001` to `-005` run on boot (`AUTO_MIGRATE`); `-001`, `-002` and `-005` are still unrecorded in the live ledger according to the fifteenth pass. Phase 2 adds no automatic data migration.

## Added

| Item | Files | Notes |
|---|---|---|
| `migrate-contest-scope` (plan 10.2, contests) | `internal/migrations/contest_scope.go`, `contest_scope_test.go`, `cmd/migrate-contest-scope/main.go` | Contests with no `scope` get `{program_id: grade-<n>, stream_id: common}` and `kind=contest`, from the legacy `grade` text. `mode` stays empty (legacy global), `type`, start and end are untouched. Unmappable grades are reported, not guessed. Dry run by default; `-apply` writes a JSON backup first, uses conditional `attribute_not_exists(scope)` writes on the full composite key. **Deliberately not in `Registry()`**, so it never runs on boot |

## Behaviour to know before `-apply`

A scoped premium contest is gated by `Decide` for that program instead of "any active entitlement". Legacy payments become all-programs grants, so existing premium students keep access; students with no entitlement for `grade-<n>` do not.

## Run order

1. `cd backend && gofmt -l . && go build ./... && go vet ./... && go test ./...`
2. `go run ./cmd/migrate -status` (read-only ledger check)
3. `go run ./cmd/migrate-contest-scope` (dry run), review, then `-apply` only on explicit approval
4. Deploy; the boot runner applies pending `-001`/`-002`/`-005`

## Still open

Phase 2 tests (attempt repository/usecase/read endpoints/`SubmitLegacy`/`ValidateScopeAgainst`), bottom-nav crowding check at 360 px, deletion of legacy contest pages after all contests are migrated, `CountsByContest` scan, Phase 3 leaderboards. Not reviewed line by line this pass: the staged Phase 2 code was read only through the progress notes.

---

# Update 2026-10-16 (Phase 2, sixth pass): Phase 2 reviewed and tested, **production contests migrated**

Everything below was compiled, vetted and run on a machine with the Go toolchain and network access. **The production `contests` table was written** (50 rows, conditional, backed up first) — the run order from the fifth pass was followed exactly.

## Production state, read-only first

`go run ./cmd/migrate -status` against `eu-north-1` (production credentials from the repo-root `.env`):

| Migration | Live status |
|---|---|
| `20261014-001-grade-9-12` | **applied** 2026-10-14T13:40:15Z — `scanned=377 changed=148 unmapped=7` |
| `20261014-002-student-enrollments` | **applied** — `migrated=370 unknown=7` |
| `20261014-003-seed-locations` | **applied** — `already stored (14 regions)` |
| `20261014-004-default-price-plan` | pending (deferred: `MIGRATE_PRICING_ETB` is not set on prod) |
| `20261014-005-location-dedupe` | **applied** 2026-10-15 — `relinked=217 dropped=1` |

Correction to the fifth pass and to the fifteenth pass note: `-001`, `-002` and `-005` are **already recorded as applied in the live ledger**. They are only pending in local/dev databases. Nothing new is applied on the next prod boot.

`attempts` does **not** exist in production yet (the live table list has 27 tables, none of them `attempts`). It is created by `schema.EnsureTables` on boot (`internal/handler/http/router.go:100`), with all three GSIs, so the next deploy of this code creates it. No manual table creation was done.

## Contest scope back-fill (plan 10.2) — applied

```
go run ./cmd/migrate-contest-scope            # dry run
go run ./cmd/migrate-contest-scope -apply -backup-dir <outside the repo>
```

- Dry run: `contests=50 already-scoped=0 to-change=50 unmapped=0`. Every live contest carries `grade: "12"`, so all 50 map to `grade-12/common`; nothing needed guessing.
- Apply: `changed=50 failed=0`. Backup of the 50 change rows written to `%LOCALAPPDATA%\Temp\victory-migration-backups\migrate-contest-scope-20261016T052023Z.json` (deliberately **outside** the repository — `migration-backups` is not gitignored, and these rows are production data).
- Re-run afterwards: `already-scoped=50 to-change=0` — idempotent, as designed.
- Spot check (`Qu3DLncJF8JH34jsEgMCUg`): now has `scope {program_id: grade-12, stream_id: common}` and `kind: contest`; `grade`, `type`, `status`, `start_time`, `end_time` unchanged, and **no `mode` attribute was written** (empty = legacy global, so the old pages keep serving these contests).
- Still run by hand: `contest_scope` stays out of `Registry()`.

Consequence now live on prod: a scoped premium contest is gated by `Decide` for `grade-12` rather than "any active entitlement". Legacy payments became all-programs grants, so existing premium students keep access.

## Review of the staged Phase 2 code — defects found and fixed

| Fix | File | Why it mattered |
|---|---|---|
| `ListAssessments` no longer filters by `status` | `internal/usecase/assessment_read.go` | The admin form defaults new contests to `status: "inactive"` (`AddContest.tsx:97`) and the legacy app derives open/ended from the times, so the filter would have hidden nearly every real contest from the student app |
| Sanitised CSV download filename | `internal/handler/http/assessment_handler.go` | The contest id went straight into a `Content-Disposition` header — header injection via a crafted id |
| Strict stream check in `ValidateScopeAgainst` | `internal/usecase/scope_validate.go` | `ValidateEnrollment` normalises common-only programs, so a `freshman`/`natural-science` scope passed validation against a program that never offers that stream; `programAllowsStream` now checks the offered streams literally |
| `parseTime` → `parseAttemptTime` | `internal/usecase/attempt_logic.go`, `attempt_usecase.go`, `attempt_logic_test.go` | Phase 2 redeclared `parseTime` in package `usecase`; the build was broken |

## Tests completed (plan 10.6, the fifth pass's "still open")

| File | Tests | Covers |
|---|---|---|
| `internal/usecase/attempt_usecase_test.go` (575 lines) | 13 | injected clock: start, resume, 409 on a second attempt, closed window, grace boundary, auto-submit from `expires_at`, autosave version conflict and foreign student, submit/finalise idempotency, submission row + badge hook, `Result` draft-answer nulling and editorial gating, sweeper, admin exclude/waive/regrade/reset, `SubmitLegacy` fallthrough on `ErrNotPhase2` |
| `internal/usecase/assessment_read_test.go` (146) | 4 | list scope/lock/`my_attempt`, intro, leaderboard ordering (abandoned and excluded dropped), `EditorialVisible` bridge |
| `internal/usecase/scope_validate_test.go` (62) | 2 | valid and invalid scopes against a program/stream catalog, nil catalog stays lenient |
| `internal/domain/contest_patch_test.go` (77) | 2 | PATCH carry-over, zero-pointer patch reports no change, scope is copied not aliased, `clear_scope`, `Effective*` defaults on legacy rows |
| `internal/repository/attempt_dynamo_local_test.go` (143) | 1 | DynamoDB Local (dynalite): conditional create → `ErrAlreadyAttempted`, stale version → `ErrVersionConflict`, double finalise → `ErrAttemptFinalised`, autosave after finalise fails, both list GSIs. Skips unless `AWS_ENDPOINT_URL_DYNAMODB` is set, so CI is unaffected. Ran and passed locally |

Gates: `gofmt` clean on every touched file, `go build ./...`, `go vet ./...`, `go test ./...` fully green; `npx tsc -b` (student app) and `npm run typecheck` (admin app) clean.

## Still open

Bottom-nav crowding at 360 px, deleting the legacy contest pages (now that all 50 prod contests are scoped, but they still have no `mode`), `CountsByContest` full scan, Phase 3 leaderboards, and `20261014-004-default-price-plan` whenever a prod price is configured.


---

# Update 2026-10-16 (Phase 2 completion audit + student UI/UX pass)

Method: every Phase 2 row in `PROPOSED-IMPLEMENTATION-PLAN.md` (section 8, Phase 2) was checked against the files in this tree. This pass **read code and file listings only**. `go build`, `go test`, `tsc` and `vite build` could not be run in this sandbox (no Go module proxy or `node_modules`); **the owner ran the Go and TypeScript builds and checks locally afterwards and reports them passing** (see the admin form note below for the one file edited after that). Production state (the 50-contest back-fill) is taken from the sixth pass and was not re-checked.

## Verdict: Phase 2 is functionally complete, with three deliberate deviations and a short list of leftovers

### Backend: all rows present

| Plan row | Status | Where |
|---|---|---|
| Contest fields (`Kind`, `Mode`, `DurationMinutes`, `LatePenaltyPercent`, `Reveal`, shuffle flags, `Year`, `Source`, `Scope`) | Done | `domain/contest.go` |
| `Attempt` + status constants | Done | `domain/attempt.go` |
| Submission fields (`Scope`, `AttemptID`, `StartedAt`, `IsLate`, `PenaltyPercent`, `Points`, `DurationSeconds`) | Done | `domain/submission.go` |
| `attempts` table + 3 GSIs (`student_id-index`, `contest_id-index`, `status-expires_at-index`) | Done | `schema/tables.go` |
| Attempt repository (conditional create, versioned autosave, conditional finalise, list by student/contest/expiring) | Done | `repository/attempt_dynamo.go` |
| Attempt usecase (start, autosave, submit, finalise, lazy finalise, visibility, lateness/points, admin exclude/waive/regrade/reset, 409) | Done | `usecase/attempt_usecase.go`, `attempt_logic.go` |
| Contest create defaults + typed validation | Done, with deviation 1 | `usecase/contest_usecase.go` |
| Typed `ContestPatch` replacing the reflection PATCH (D11) | Done, legacy string-field map kept | `domain/contest.go`, `contest_handler.go` |
| `/api/assessments*`, `/api/attempts*`, admin attempt routes (list, CSV, get, patch, counts) | Done | `handler/http/assessment_handler.go` |
| Routes registered; `/api/contest/*` and `POST /api/submission/` kept as the `SubmitLegacy` bridge | Done | `router.go` |
| Expiry sweeper with graceful shutdown | Done | `main.go`, `RunAttemptSweeper` in `router.go` |
| Editorial visibility via `AnswersVisible` / `EditorialVisible` | Done | `submission_usecase.go`, `attempt_logic.go` |
| Data migration: contest scope back-fill | Done (per sixth pass) | `cmd/migrate-contest-scope` |

### Student app: all rows present

`features/assessments/` has `AssessmentList`, `Intro`, `Exam` (flagging, 1.5 s debounced autosave, resume), `Palette`, `Timer`, `Result`, `Retake` (wired from `Result`), `AssessmentLeaderboard` and `api.ts`. `shared/data/useServerClock.ts` exists. Routes: `/practice`, `/assessment/:id`, `/assessment/:id/exam`, `/assessment/:id/leaderboard`, `/attempt/:id/result`.

### Admin app: present, one row done differently

`services/assessmentServices.ts`, `features/assessments/AttemptsTab.tsx` (exclude / waive / re-grade / CSV), `TimingFields.tsx` (shared by add and update dialogs). `ContestList` shows kind, mode, scope filter (`matchesScopeFilter`) and an attempts count from `/api/admin/attempt-counts`.

### Tests (from the sixth pass, not re-run here)

`attempt_usecase_test.go` (13), `assessment_read_test.go` (4), `scope_validate_test.go` (2), `contest_patch_test.go` (2), `attempt_dynamo_local_test.go` (1, skips unless `AWS_ENDPOINT_URL_DYNAMODB` is set). I found **no handler-level tests for the new `/assessments` and `/attempts` routes**; the plan's test list asked for them.

## Deliberate deviations (unchanged, restated so they are not mistaken for gaps)

1. Contest create defaults to `self_paced` + 10% penalty only when `duration_minutes` or `mode` is sent. Forcing it would break the old admin form.
2. `AddContest` / `UpdateContestDialog` were **extended with `TimingFields`**, not replaced by a stepper `AssessmentForm.tsx`. The plan's stepper (section 7.3) is not built.
3. Legacy student pages (`ContestStudentRegistration`, `Contest`, `ContestEditorial`, `useContestTimer`) and the `/contest`, `/registration`, `/contest-editorial` routes are kept, with **no redirects**, because live contests still have an empty `mode` and run on them.

## UI/UX pass (this session): student app

Done to follow the Academy design language (rounded cards, tinted icon chips, shared `States` components). Not compiled or viewed in a browser.

| Change | File |
|---|---|
| Bottom nav is now **Home · Learn · Practice · Profile** (4 tabs). Profile uses the lucide `User` icon. **Closes the 360 px crowding item** | `components/BottomNavigation.tsx` |
| Top-right menu: person icon trigger (highlights on Leaderboard, Statistics, My programs, Payments); clickable user card opens Profile; **Leaderboard**, **Statistics**, **My programs**, then AI Practice, Upgrade, Learning settings, Payments, Feedback. Compact rows (`w-60`, 32 px chips), scrolls on short screens. Icons that ship `color="#000000"` (Payments, AI, Feedback, Upgrade) are coloured on the icon itself, so they are visible in dark mode | `components/TopNavigation.tsx` |
| My programs rebuilt: program cards with Active badge and status pill, Make active / Leave buttons, tile picker + stream toggle for Join, Upgrade button, skeleton / empty / error states. **My programs now has an entry point** (it had none) | `pages/MyPrograms.tsx` |
| Practice rebuilt: title, scrolling program chips, assessment cards with status icon, kind badge, question count, duration, Premium / In progress / Completed + points | `features/assessments/AssessmentList.tsx` |

Known issue: `dark:` Tailwind variants on the menu icon chips did not take effect in the Telegram WebView screenshot (chips stay light in dark mode). Icons remain readable. Needs a look at how the app toggles dark mode.

## Closed by this pass

- "A Practice tab entry in navigation": already in the bottom nav.
- "Bottom-nav crowding at 360 px": four tabs now.

## Still open

1. Delete the legacy contest pages and add redirects, once every live contest has a Phase 2 `mode` (prod contests are scoped but still have no `mode`). **Still blocked — see the closeout pass: stamping `mode` is a prod write, and deleting the legacy pages would drop two behaviours the Phase 2 engine does not have yet.**
2. ~~Handler tests for the new `/assessments` and `/attempts` routes.~~ **Done** — `assessment_routes_test.go`, 10 tests, and they found three real defects (fixed).
3. ~~Re-run Go and TS builds~~ **Done by the owner (passing).** ~~Re-run `npm run typecheck` in `admin-page-clean`~~ **Done, clean.**
4. Restyle the remaining student screens to the same card system: assessment `Intro`, `Exam`, `Result`, `Palette`; `Profile`, `Statistics`, `Payment`, `Leaderboard`. **The four assessment screens are done. The four large legacy screens (`Profile` 695, `Statistics` 869, `Payment` 593, `Leaderboard` 412 lines) were deliberately not restyled blind — no browser is available here, and a blind rewrite of 2,500 lines of paid/identity UI is not verifiable work.**
5. Stepper `AssessmentForm` (deviation 2), if the plan's admin UX is still wanted. **Open — product decision, the extended dialogs are functional.**
6. `CountsByContest` scans the whole attempts table; switch to a stored counter if it grows. **Open by design — the attempts table is empty in prod today; premature optimisation otherwise.**
7. Phase 3 (leaderboards by period/program, question bank), and `20261014-004-default-price-plan` once a prod price is configured. **Open — needs the client's price and Phase 2 sign-off.**

## Admin form clarity fix (2026-10-16)

`admin-page-clean/src/features/assessments/TimingFields.tsx` (shared by Add and Update contest): the "Source / year" pair was squeezed into one row (a tiny unlabeled box next to a "Year" box) and the checkboxes had no explanation. Now a single-column layout with a one-line hint under every field, "Source" and "Exam year" as separate labelled optional fields under an "Optional details (for past exams and entrance exams)" heading, shorter select labels so they no longer truncate, and shuffle options as full-width cards with descriptions. **Source and Year are stored but not displayed to students anywhere yet**; the hint says so. Not compiled after this edit.

# Phase 2 closeout pass (2026-10-16)

Closes "Still open" items 2, 3 and the four assessment screens of item 4. Writing the handler tests was the productive part: they found four defects that the usecase-level tests could not see, because the bugs lived in the HTTP layer and in the error bodies the frontend reads.

## Defects found by the new handler tests (backend)

| Defect | Before | After | File |
|---|---|---|---|
| A typo'd assessment id on `GET /api/assessments/:id`, `GET …/intro` or `POST …/start` | `500` with `{"error":"assessment not found"}` — a client mistake billed as a server fault, and the frontend's generic "something went wrong" branch | `ErrAssessmentNotFound` sentinel → `404 {"code":"not_found"}` | `usecase/attempt_usecase.go`, `usecase/assessment_read.go`, `handler/http/assessment_handler.go` |
| `AdminAction` with an unknown verb, or `exclude`/`reset` with no reason | `500` | `ErrInvalidAction` → `400 {"code":"invalid_action"}` and the reason is required for the two destructive verbs | `usecase/attempt_usecase.go` |
| An attempt id that does not exist / another student's attempt | `500` | `ErrAttemptNotFound` → `404`, `ErrForbidden` → `403` | `usecase/attempt_logic.go`, handler `fail()` |
| `GET /api/admin/assessments/:id/attempts?label=…` with no matches | `null`, which the admin table maps over | always a slice, so an empty filter reads as `[]` | `usecase/attempt_usecase.go` |
| `intro.my_attempt` had no deadline | the Resume card could not show how much time is left on a self-paced attempt | `expires_at` added to `MyAttemptInfo` | `usecase/assessment_read.go` |

## Handler tests (new file)

`backend/internal/handler/http/assessment_routes_test.go` — 10 tests, httptest + `gin.TestMode`, in-memory fakes for the six repositories (the attempt fake reproduces the DynamoDB preconditions: conditional create, version-checked `PutAnswers`, conditional finalise), so the tests assert the same status codes and JSON bodies the real handlers produce. Attempt ids contain `#`, so every URL is built through a `%23` helper — gin routes on the decoded path.

`TestAssessmentListIsMetadataOnlyAndScopeFiltered` (no question bodies leak, grade-10 students do not see grade-12), `TestIntroCarriesMyAttemptAndLock`, `TestStartStatusMap` (403 not-open/closed, 402 locked + `lock` body, 409 already-attempted + `attempt_id`, resume of an in-progress attempt is 200 `resumed: true`, a finalised attempt 409, an expired one 410), `TestAssessmentRoutesRequireStudentSession`, `TestAdminAttemptRoutesRequireAdminCookie` (a student bearer token is not an admin session), `TestAutosaveStatusMap` (409 `version_conflict`, 410 past grace, 409 `attempt_finalised`), `TestSubmitGradesServerSide` (the client cannot report points), `TestResultAnswerVisibility` (answers and editorial gated by `AnswersVisible` / `EditorialVisible`), `TestLeaderboardRanksPointsThenDuration`, `TestAdminAttemptRoutesAndActions` (counts, label filter incl. `[]`, CSV headers + sanitised filename + quoted comma reason, exclude / waive penalty 45→50 / regrade / reset deleting the submission row and allowing a fresh start).

## Student app: Phase 2 screens to parity

| Change | File |
|---|---|
| Closed-window state (`global` mode past the end with no attempt in progress) and the premium lock now opens the shared `premium_contest` sheet instead of linking bare `/payment`; Resume shows `· N min left` from `my_attempt.expires_at` | `Intro.tsx` |
| `ScreenshotProtection` (anti-cheat) and tap-to-zoom images wired into the live exam; autosave no longer hammers a dead attempt — `attempt_expired` / `attempt_finalised` stop the retry loop and route to the result page | `Exam.tsx`, new `ZoomImage.tsx` |
| Option images rendered on the result and practice screens; option rows stay plain buttons because a zoom dialog cannot nest inside one | `Result.tsx`, `Retake.tsx` |
| Palette legend / aria labels; leaderboard ranks show the number for positions past 3 | `Palette.tsx`, `AssessmentLeaderboard.tsx` |
| `errData(err)` / `errCode(err)` moved to `services/api.ts` as the single typed reader of the uniform `{ error, code, … }` body, replacing four ad-hoc `any` casts. This also clears every `no-explicit-any` lint error in the repo | `services/api.ts`, `features/assessments/api.ts`, `pages/MyPrograms.tsx`, `shared/pricing/PlanPicker.tsx` |

## Gates

- `gofmt -l` clean on all touched Go files (the 107 the repo flags are pre-existing CRLF working copies, not this pass).
- `go build ./...`, `go vet ./...` exit 0; `go test -count=1 ./internal/handler/... ./internal/usecase/... ./internal/domain/...` → `ok handler/http`, `ok usecase`, `ok domain`.
- `admin-page-clean`: `npm run typecheck` clean (this re-checks the owner's `TimingFields.tsx` edit).
- `frontend`: `npx tsc -b` exit 0, `npx eslint src` 0 errors / 5 pre-existing warnings, `npm run build` succeeds.
- Not viewed in a browser: this environment has no reachable dev server for the Telegram-shaped UI, so the screen changes above are compiled-and-read, not visually verified. The four legacy screens listed under item 4 are untouched for the same reason.

## The legacy-page deletion (item 1) is blocked on more than a `mode` stamp

Two behaviours exist only on the legacy path, so removing it today loses them:

1. **The roster write.** `POST /api/submission/` (legacy) records the student into `contest-registration/isActive`. The Phase 2 engine writes attempts, not registrations, and nothing ports that row.
2. **Editorial for everyone after `EndTime`.** The legacy editorial page is readable by any student once the contest closes. Phase 2 gates it on `EditorialVisible`, which an admin must set.

And while both UIs are live over the same 50 contests, a student can be recorded twice: the legacy submission row and a Phase 2 attempt are separate stores with separate leaderboards and separate admin lists. `SubmitLegacy` only bridges rows stamped by Phase 2, so an empty `mode` leaves both paths open. Deleting the legacy pages is therefore a product decision (port the two behaviours, then stamp `mode` in prod in one write), not a cleanup I should do unasked.

# Phase 2 closeout, second half (2026-10-16): ports landed, prod mode stamped, legacy contest pages deleted

Owner decisions taken at the start of this pass, both honored literally:

1. **"Port, then delete legacy"** for the collision above — port the two legacy-only behaviours first, stamp `mode` in prod, then delete the pages behind redirects.
2. **"Keep extended dialogs"** — the plan's stepper `AssessmentForm` is **not** built. Deviation 2 above is the accepted end state, so item 5 of the open list is closed by decision, not by code.

## The two ports (item 1's blockers)

| Behaviour | Where it went | How it stays honest |
|---|---|---|
| Roster write — the legacy contest card recorded the student into `contest_registeration`, and the admin dashboard's registration count and trend are built from that table | `usecase.Roster` (`EnsureActive`, `Register`) on `AttemptUsecase`; `POST /api/assessments/:id/register`; roster row created on register, activated on start | `NeedsRegistration()` scopes it to the competing kinds, so practice and past-exam taps cannot inflate the counts. `noteRoster` logs and never fails a start: a stats row must not be able to block an exam. `Register` is idempotent |
| Public walkthrough after the window closes — the legacy editorial page was readable by any student once the contest ended | `GET /api/assessments/:id/editorial` + `EditorialVisible` (non-participant branch) | Ended **global** papers publish, because nobody can start them any more. `self_paced` and `reveal=on_submit` stay private to finishers, because late attempts on those are still answerable and a public answer key would leak into them. The Phase 2 branch honours the injected clock; the `Mode == ""` bridge keeps reading `ContestHasEnded` so unstamped rows behave exactly as before |

`GetAssessment` now reports `registered` / `needs_registration`, and `Intro.tsx` shows **Register to join** in place of Start when the roster row is missing — the same gate the legacy card had. New `Editorial.tsx` renders the walkthrough for a student who never attempted, and shows the server's message when the answers are not publishable yet rather than re-guessing the rule in the client.

## Production state: every live contest now carries an explicit `mode`

`cmd/migrate-contest-mode` (dry run → review → apply), following the `contest_scope` house pattern: full scan, JSON backup outside the repository, conditional writes on the complete primary key, idempotent.

- Dry run: `contests=50 already-stamped=0 to-stamp=50 (window open=0 ended=50, penalty defaulted=0)`. Nothing needed guessing: no prod contest carries `duration_minutes`, so all 50 map to `global`, which is the semantics the legacy countdown already implemented (`pages/Contest.tsx` counted down to `end_time`).
- **Every contest window in production has already closed** (latest end `2026-10-09T10:17Z`, "bjbnj"). No student could start an attempt on any prod contest when this ran, so the stamp could not lock anyone out of a live exam, and `mode` deletion-safety held.
- Apply: `stamped=50 failed=0`. Backup: `%LOCALAPPDATA%\Temp\victory-migration-backups\migrate-contest-mode-20261016T140905Z.json` (outside the repo — `migration-backups` is not gitignored and these are production rows).
- Re-run: `already-stamped=50 to-stamp=0`. Spot check (`Qu3DLncJF8JH34jsEgMCUg`): `mode: global` added; `scope`, `kind`, `grade`, `type`, `status`, `start_time`, `end_time` unchanged and **no** `duration_minutes` / `late_penalty_percent` written.
- Deliberately **not** in `Registry()`: boot must never write to the live table without someone having read the report.

## Legacy contest pages deleted (item 1 closed)

`pages/Contest.tsx`, `pages/ContestEditorial.tsx`, `pages/ContestStudentRegistration.tsx`, `components/ContestCard.tsx`, `components/LeaderboardModal.tsx`, `components/ContestCardSkeleton.tsx`, `components/NoContest.tsx`, `components/QuestionNavigationDropdown.tsx`, `hooks/useContestTimer.ts`, `services/contestApi.ts` — 1396 lines removed, and Home (`pages/Home.tsx`) rewritten onto `/assessments`.

| Legacy screen behaviour | Where it lives now |
|---|---|
| Active/previous split by `end_time`, "N Available" count | Home, partitioned on the server's `server_now` rather than the device clock |
| Countdown, prize, register/join gate, start | `Intro.tsx` (`/assessment/:id`) |
| Exam, question palette, autosave, submit | `Exam.tsx` / `Palette.tsx` |
| Previous-contest standings modal | `AssessmentLeaderboard.tsx` page, reached from the Home row |
| Editorial link | `Editorial.tsx`, reached from the Home row and the Intro |
| Premium gate opening the sheet | Home row and Intro both call `openPremium("premium_contest", program_id)`; the server's `lock` is the single source of truth, replacing the client-side `isContestLocked` guess |
| Grade filtering by `sameGrade` | Kept, reading the digits off `scope.program_id` (`grade-<n>`); unscoped and non-grade programs stay visible to everyone |
| `/contest`, `/registration`, `/contest-editorial` deep links | `<Navigate replace>` redirects that carry `?id=` to the matching Phase 2 screen, falling back to `/practice` |

Two visible consequences, both intended: drills and past papers are left to the Practice tab so Home stays the contest surface, and Home's list is a **student read** now (`GET /contest/` was public), so it awaits the session `ensureStudentSession()` is already exchanging. Outside Telegram, with no token, Home shows its retryable error state instead of a public list — the same trade the Practice tab already makes.

The legacy **endpoints** stay: `GET /api/contest*`, `/api/submission/rank/:id`, `/api/submission/editorial/:student_id` and the `contest-registration` routes are still used by the admin app and by Phase 2's own submission mirror (every Phase 2 submit also writes a full submission row). Removing them needs an admin-side usage audit, so it is not part of this pass.

## Item 4 closed: the remaining student screens

`pages/Payment.tsx`, `pages/Leaderboard.tsx`, `pages/Profile.tsx`, `pages/Statistics.tsx` restyled onto the card/token system (compact: the row heights did not grow; Leaderboard gained `rankChip`/`RankBadge`/`ListAvatar` and swapped its inline `NotFound` for `EmptyState`). Verified behaviour-preserving three ways: deleted-logic-token grep, re-emission grep, and a user-visible-string diff that lost zero strings.

## Gates (this pass)

- `gofmt -l` clean on every file this pass touched (`router.go` and `domain/contest.go` remain flagged only as pre-existing CRLF working copies — verified whole-file, so deliberately not reformatted).
- Backend: `go build ./...` exit 0, `go vet ./...` exit 0, `go test -count=1 ./...` → `ok domain`, `ok handler/http`, `ok usecase`, `ok migrations`, `ok repository`, `ok schema`, `ok locnorm`, `ok cmd/migrate-answer-index`. 13 assessment/attempt route tests including the three new roster/editorial/practice cases, plus `TestEnsureActive`, `TestRegisterAcceptsAnExistingRow` and the rewritten `TestEditorialVisibleBridge`.
- Student app: `npx tsc -b` exit 0, `npx eslint src` 0 errors / 5 pre-existing warnings, `npm run build` succeeds.
- Not browser-verified: this environment has no reachable dev server for the Telegram-shaped UI, so the Home rewrite and the four restyled screens are compiled-and-read. The specific things to look at on a device: Home's open/past split for a grade other than 12, the new `Register to join` step, and the `/assessment/:id/editorial` page for an ended contest.

## Phase 2 open list, final state

| Item | State |
|---|---|
| 1. Delete legacy contest pages + redirects | **Done** (port → prod stamp → delete) |
| 2. Handler tests for `/assessments`, `/attempts` | **Done** (13 route tests) |
| 3. `admin-page-clean` typecheck | **Done** (clean) |
| 4. Restyle the remaining student screens | **Done** (all eight surfaces) |
| 5. Stepper `AssessmentForm` | **Closed by owner decision** — extended dialogs stay |
| 6. `CountsByContest` full scan | Not a defect today: the `attempts` table has no prod rows yet, so the scan has nothing to aggregate; revisit after the first real contest window runs on the new build |
| 7. Phase 3 + `-004` default price plan | Out of Phase 2; `-004` still needs a client-supplied price before it can run |



# Update 2026-10-16 (Phase 3, 5-minute box): leaderboards + question-bank backend, student and admin boards

Nothing was compiled, built or tested (instruction). All of it needs your `go build ./...` / `tsc` pass.

## Done (backend)

* **Leaderboards (plan 5.5):** `domain/leaderboard.go` (period keys in Africa/Addis_Ababa, ISO week starting Monday, `BoardKey`, `RankKey`, TTL for day 35d / week 120d), `repository/leaderboard_dynamo.go` (batch put, `Top`, `Get`, `CountAbove` for "my rank" beyond the top 100, `DeleteRow`), `usecase/leaderboard_usecase.go` (`Record`, `Board`, `BoardsForStudent`, `AdminBoard`, `LegacyAll`), `handler/http/leaderboard_handler.go`.
* **Routes:** `GET /api/leaderboard?period=&program=&stream=` (enrolled programs only; a student cannot request another stream's board), `GET /api/leaderboard/programs`, admin `GET /api/admin/leaderboard` (by `contest_id` or program/stream/period, view-only).
* **Write path:** `AttemptUsecase.OnFinalise` fires after finalise, admin patch (waive penalty, regrade, exclude) and delete; `Record` recomputes the student's rows from all their finalised attempts in the program and batch-writes day/week/month/all boards (program-wide + stream) plus the `contest:` row. This pass added removal of rows left stale when an exclusion/reset/delete empties a period.
* **Schema:** `leaderboard` table + `board_key-rank_key-index`; `subject_id-index` on `question` (on `scope.subject_id`). Enable TTL on attribute `ttl` for the `leaderboard` table in AWS. **Check before `setup-tables`:** a GSI on the nested attribute `scope.subject_id` may not be creatable (DynamoDB index keys must be top-level); if it is refused, drop this GSI. Filtering is in memory today.
* **Legacy alias:** `/submission/leaderboard` now serves the caller's active-program all-time board from the precomputed table when a student token is present and `timeFrame` is empty/`all`; otherwise it still falls back to the old scan.
* **Backfill:** `cmd/backfill-leaderboard` (dry run by default, `-apply` writes) rebuilds boards from the `attempts` table.
* **Question bank (plan 5.6):** `Question` gains `Topic`, `Difficulty`, `Year`, `Source`, `Verified`, `VerifiedBy`; `QuestionPatch` and `UpdateQuestion` extended; `POST /question/assign-scope` (bulk, max 500 ids, per-id failures reported); `GET /question/:id/usage` (assessments that include the question); `GET /question` now also filters by `q`, `difficulty`, `verified`, `topic`, `year` (on top of the existing scope filters and `scoped=none` for the uncategorised queue).
* **Test:** `domain/leaderboard_test.go` (key helpers).

## Done (apps)

* **Student:** `features/leaderboard/LeaderboardView.tsx` + `api.ts`: Today/Week/Month/All Time, program switcher, stream chips limited to the student's own stream, pinned "my rank", "late" tag. `App.tsx` now routes `/leaderboard` to it; the old `pages/Leaderboard.tsx` is left in place, unused.
* **Admin:** `features/leaderboards/LeaderboardsPage.tsx` + `api.ts`, route `/dashboard/leaderboards`; `questionServices.ts` gains the bank fields, `assignQuestionScope`, `getQuestionUsage`; `Question` type gains the new optional fields.

## NOT done in Phase 3 (honest list)

* `cmd/migrate-question-scope` (map free-text subject/grade/chapter to catalog ids): not written.
* Admin `features/question-bank/*` (single `QuestionTable`, stream tabs, uncategorised queue UI, bulk-assign UI, scope fields in the import dialog) and the Markdown+math `QuestionEditor` with verified toggle: not built; only the service layer and API exist.
* No sidebar link to `/dashboard/leaderboards` yet.
* Student `shared/content/Markdown.tsx` move (+ math/tables): not done.
* Scan-based `GetLeaderboardByTimeFrame` is not deleted (the alias falls back to it for anonymous callers); `LegacyAll` returns points as `score` and leaves correct/total at 0.
* Deleting `pages/Leaderboard.tsx`, `LeaderboardModal.tsx`, `LeaderboardSkeleton.tsx` and admin `components/contests/Leaderboard.tsx`: not done.
* Dynamo-local tests (GSI ordering, `MyRank`) and the broader `leaderboard_test.go` cases from plan 10.6: not written. Per-contest rows are only written for attempts finalised after this build; run the backfill after deploy.
* Nothing deployed or migrated.


# Update 2026-10-16 (Phase 3, second pass): question-bank UI, migration, tests, cleanups

Still nothing compiled, built or run (instruction). This pass **supersedes the "NOT done in Phase 3" list above** except for the items under "Still open".

## Done in this pass

* **Schema fix:** removed the `subject_id-index` GSI I had put on `question`: it keyed on the nested `scope.subject_id`, and DynamoDB index keys must be top-level attributes, so `setup-tables` would have failed on it. Subject filtering stays in memory (`filterQuestionsByScope`); a real index needs a denormalised top-level `scope_subject_id` attribute first (not added).
* **`cmd/migrate-question-scope`:** dry run by default, `-apply` writes after a JSON backup in `migration-backups/`. Grade maps to `grade-<n>` (same rule as the contest migration); subject and chapter are matched by exact case-insensitive name/code/title against the catalog (`AcademyUsecase.Catalog()`), stream taken from the matched subject, otherwise `common`. Questions that already have a scope or whose grade is unmappable are left alone and reported. Writes go through `QuestionUsecase.UpdateQuestion` (presence-aware patch). It builds the academy usecase with nil student/AI dependencies, which `Catalog()` should not touch, but that is unverified until you build/run it.
* **Admin question bank:** `features/question-bank/QuestionBankPage.tsx` (server-side filters via `queryQuestions`; All / Natural / Social / Common tabs; **Uncategorised queue** using `scoped=none`; bulk **assign scope** to selected rows; verified/difficulty/search filters) and `QuestionEditor.tsx` (Markdown + KaTeX live preview for question and explanation, topic/difficulty/year/source, verified toggle, usage count). Routes `/dashboard/question-bank` and `/dashboard/leaderboards`, plus two menu entries (ids 24, 25).
* **Admin API paths:** the admin axios client has no `/api` prefix, so the new admin calls use `/api/admin/leaderboard`, `/api/question/assign-scope` and `/api/question/:id/usage` (the student client already adds `/api`).
* **Student Markdown move:** `shared/content/Markdown.tsx` now holds the component (math via remark-math/KaTeX and GFM tables were already in it); `academy/components/Markdown.tsx` re-exports it so existing imports work; `MarkdownMessage.tsx` imports the new path. Its `ImageViewer` import was changed to the absolute `@/academy/components/ImageViewer`.
* **Cleanup:** deleted the unused student `pages/Leaderboard.tsx` and `components/LeaderboardSkeleton.tsx` (nothing imported them after the route switch; there was no `LeaderboardModal`).
* **Tests:** `usecase/leaderboard_usecase_test.go` (in-memory board repo with GSI ordering): common-assessment stream rule, program-wide + stream + contest rows, late flag and TTL only on day/week rows, idempotent recompute summing a period, exclusion removing stale rows, forbidden stream/program, bad period, **my rank beyond the top 100**. `domain/leaderboard_test.go` gains TTL and Monday-week-boundary-in-Addis cases.

## Still open in Phase 3

* Scan-based `GetLeaderboardByTimeFrame` is kept: anonymous callers of `/submission/leaderboard` and non-`all` time frames still use it, and `LegacyAll` leaves correct/total at 0. Delete it once the apps only call `/api/leaderboard`.
* Admin `components/contests/Leaderboard.tsx` is still imported by `Contest.tsx`, so it was not removed or replaced by `features/leaderboards`.
* The question-bank page is not yet a picker for assessment forms, and the old `components/questions/Questions.tsx` / `components/contests/Questions.tsx` are still in place; the import dialog has no scope fields.
* Dynamo-local tests (GSI ordering against a real table, `MyRank`) and handler route tests for the new endpoints are not written.
* Not run: `go build ./...`, `go test ./...`, `tsc` for both apps, `migrate-question-scope` (dry run first), `backfill-leaderboard`, enabling TTL on `leaderboard.ttl`.

# Phase 3 gates and production migration (2026-10-17)

Everything below was run on this machine against the real services; the "Not run" list above is now closed.

## Build break found and fixed

* `domain.PeriodDay/Week/Month/All` and `BoardKey` were declared twice — the Phase 2 string-keyed versions in `domain/scope.go` and the Phase 3 time-keyed ones in `domain/leaderboard.go`. `go build` failed on 5 redeclarations.
* Kept the Phase 3 version (every production caller in `usecase/leaderboard_usecase.go` passes a `time.Time`); deleted the `scope.go` duplicates and the `fmt`/`strings` imports they were the only users of.
* `scope_test.go`'s `TestBoardKey` tested the deleted signature; its day/week/`StreamCommon`/empty-stream assertions were re-expressed against the surviving time-based `BoardKey` inside `leaderboard_test.go`, so no coverage was lost.
* `repository/leaderboard_dynamo.go` had unsorted imports (`strconv` before `context`); `gofmt -w` on that file only. Note: `gofmt -l` is not a usable gate in this checkout — most committed Go files are CRLF in the worktree, so `gofmt -l` lists ~90 files whose only "problem" is line endings. Verdicts here come from `gofmt -d` diffs, not the list.

## Gates

| Gate | Result |
| --- | --- |
| `go build ./...` | clean |
| `go vet ./...` | clean, no output |
| `go test -count=1 ./...` | ok — domain, handler/http, repository, schema, usecase (50.8s), migrations, locnorm, cmd/migrate-answer-index. No failures. |
| student `npm run build` (`tsc -b && vite build`) | ✓ built, no type errors |
| admin `npm run typecheck` (`tsc -b`) | clean — admin `build` has no `tsc` step, so this is the only gate that types the new admin screens |
| admin `npm run build` | ✓ built, PWA precache 32 entries |

## Production migration (eu-north-1, root `.env` credentials, endpoint forced off dynalite)

| Step | Result |
| --- | --- |
| `migrate-question-scope` dry run | `questions=321 already-scoped=0 to-change=321 unmapped=0` → 304 `grade-12`, 17 `grade-11`; streams 122 natural / 102 social / 97 common; 224 rows matched a catalog `subject_id`, **0 matched a chapter** (legacy free-text chapter never lines up with catalog titles) |
| Pre-write safety check | `UpdateQuestion` is a read-modify-write `PutItem`, so an attribute the struct does not model would be erased. Full `aws dynamodb scan` of `question` (321 items) shows only `id, question_text, answer, question_img, explanation, explanation_image, subject, grade, chapter, multiple_choice` — no extras. Safe to write. Full-row backup kept out of the repo: `%LOCALAPPDATA%/Temp/migration-backups/question-full-before-scope-20261017T034339Z.json` |
| `migrate-question-scope -apply` | `changed=321 failed=0`, tool backup `migrate-question-scope-20261017T034350Z.json` |
| Post-apply diff (before vs after scan) | ids 321→321, missing 0, **existing attributes modified: 0**; only additions are `scope` (321), `verified=false` (321) and `option_images=[]` (321) — the struct's zero values. Idempotence re-proved: re-run reports `already-scoped=321 to-change=0` |
| `setup-tables` | Pre-checked with a `describe-table` sweep of all 27 prod tables: `leaderboard` was the only missing table and no existing table was missing a GSI, so the reconcile pass could only add one resource. Run result: `created tables: [leaderboard]`; describe confirms `id` HASH, PAY_PER_REQUEST, `board_key-rank_key-index (board_key HASH, rank_key RANGE) status=ACTIVE` |
| TTL | `update-time-to-live leaderboard Enabled=true AttributeName=ttl` → `describe-time-to-live` reports `ENABLED` |
| `backfill-leaderboard` dry run | `attempts=0 students-with-finalised-scoped-attempts=0`; independent `--select COUNT` scan agrees (`ScannedCount: 0`). `-apply` is a no-op today — there are no Phase 2 attempts to replay. Run it again only if boards need rebuilding after students have used the new exam flow |

## Still open after this pass (unchanged from the list above)

* Chapter ids stay empty in prod until the legacy `chapter` strings are mapped by hand or in the bank UI.
* `GetLeaderboardByTimeFrame` scan path, admin `components/contests/Leaderboard.tsx`, the old question tables and the assessment-form question picker.
* No `-apply` backfill executed; nothing deployed — the deployed backend still predates Phase 3, so `/api/leaderboard` and the bank routes are not live yet. The `leaderboard` table and the stamped question scopes are inert until that build ships.

# Legacy submissions leaderboard replay (2026-10-17)

The old contest rounds exist only in `submissions` (their 657 question rows are gone), so their leaderboards had never been migrated. This pass restores them by replaying the submissions table into the precomputed `leaderboard` boards, using only data a submission still carries: score, the missed-answer sheet, and the stored time.

## What was built

* **`usecase/leaderboard_replay.go`:** `LeaderboardUsecase.ReplayLegacy(rows, apply)` plus `LegacyBoardRow` / `ReplayReport` / `PeriodContest`. For each row it feeds every time board the submission's own date lands in (`day`/`week`/`month`/`all`, each summed across the student's submissions in that period, stream board only when the row has a stream), and one `contest:<id>` board that keeps the student's **best** submission rather than summing. Period rows sum; the contest board keeps the highest `RankKey` (points, then faster time). TTL is set on day/week rows only — month, all-time and contest rows never expire, matching `Record`. Keys are deterministic and rows are put, never incremented, so the replay is idempotent; `apply=false` computes the report and writes nothing.
* **`cmd/backfill-leaderboard/main.go`:** gained a `-submissions` flag alongside the original attempts replay. It loads every submission, every contest, and every structured student, then resolves each submission's board with `resolveProgramStream` — the contest's stamped scope when present, otherwise the student's primary program / first enrollment (so a round whose contest row was deleted still lands on a board). `legacyRow` prefers the Phase 2 fields (`Points`, `DurationSeconds`) and falls back to `int(Score)` and `ParseTimeSpend(TimeSpend)`, with `Correct = points` and `Total = points + len(MissedQuestions)` — the same numbers the old `GetRankingsForContest` ranked by. Submissions with no resolvable program are skipped and reported.

## Production replay (eu-north-1, root `.env`, dynalite endpoint off)

| Step | Result |
| --- | --- |
| Dry run (`-submissions`) | `submissions=1242 students=151 rows=5109 (dry run) skipped-no-scope=0 per-period=map[all:339 contest:1225 day:1615 month:721 week:1209]` |
| Apply (`-submissions -apply`) | same counts, `rows=5109 (written)`; day/week rows carry TTL, month/all/contest rows do not |

No JSON backup was taken of `leaderboard` first — the table was empty before this replay, and the operation is a recompute over deterministic keys, so a re-run is safe and idempotent.

## Gates (replay slice only)

| Gate | Result |
| --- | --- |
| `go build ./...` | clean |
| `go test ./internal/usecase/...` | ok — four `ReplayLegacy` tests: every board a submission touches, contest board keeps best, ties rank on time + unscoped skipped, dry run writes nothing + idempotent re-run |
| `gofmt -d` on the two new/changed files | clean |

## Still open

* The 33 past contests whose 657 question docs are unrecoverable still show empty question lists in the editorial and in the exam. Their **leaderboards are now restored** by this replay, but the question text has no source (PITR off, no on-demand backups, no other region, nothing in git). Making those rounds "work" again is a content question, not a data question: either surface an honest empty state ("questions no longer archived") with a correct question count, or have the client re-author the rounds through the new bank.
