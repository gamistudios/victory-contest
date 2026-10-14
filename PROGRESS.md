# Implementation progress: Phase 0 and Phase 1

Plan: `PROPOSED-IMPLEMENTATION-PLAN.md` (revision 4). Date: 2026-10-14.

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
