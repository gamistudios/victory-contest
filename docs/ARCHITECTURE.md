# Architecture

- **Programs** are data (`AcademyProgram`: kind, group, features, grade, sort order, open for registration). Streams: natural, social, `common` (visible to every stream of a program). `GET /api/catalog` is the public, ETag-cached catalog (programs, streams, subjects, chapters, locations).
- **Enrollment**: a student has `primary_program_id` and `enrollments[]` (program, stream, confirmed). Students cannot leave their last program; stream is editable only while unconfirmed. The Academy active program must be an enrolled one.
- **Access**: `usecase.Decide` is the single access rule (scope match, entitlement, 3-day grace). Contests may carry a `Scope`; unscoped premium contests fall back to "any active entitlement".
- **Pricing**: `price_plans`, `coupons` (atomic redemption counter), `entitlements` (rebuilt from approved, non-revoked payments). The server recomputes price and validity; client amounts are ignored. Admin grants are approved payment rows so they can be revoked.
- **Locations**: admin-managed regions/cities in `reference_data`, seeded from `usecase/locations_seed.json`; students pick ids or an "Other" free-text value.
- **Tables** (auto-created in `schema/tables.go`): existing tables plus `reference_data`, `price_plans`, `coupons`, `entitlements`.
- **Known limits**: academy snapshot cache is per-process (20 s TTL); each academy doc is one DynamoDB item (400 KB cap).
