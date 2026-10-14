package migrations

import "context"

// Registry is the ordered list of data migrations. APPEND ONLY, with a larger
// id each time (YYYYMMDD-NNN-name). Never edit or renumber a shipped entry.
func Registry() []Migration {
	return []Migration{
		{
			ID:          "20261014-001-grade-9-12",
			Description: "Student grade 1-4 -> 9-12 (plan D1)",
			Run: func(ctx context.Context, env Env) (Result, error) {
				return MigrateGrade(ctx, env, "student")
			},
		},
		{
			ID:          "20261014-002-student-enrollments",
			Description: "Give legacy students a grade-<n> enrollment (plan 5.2)",
			Run: func(ctx context.Context, env Env) (Result, error) {
				return MigrateEnrollments(ctx, env, "student")
			},
		},
		{
			ID:          "20261014-003-seed-locations",
			Description: "Store the region/city seed in reference_data (plan 5.1)",
			Run: func(ctx context.Context, env Env) (Result, error) {
				return MigrateLocations(ctx, env, "reference_data")
			},
		},
		{
			ID:          "20261014-004-default-price-plan",
			Description: "Seed the default All-access plan when MIGRATE_PRICING_ETB is set (plan 5.12)",
			Run: func(ctx context.Context, env Env) (Result, error) {
				o, set, err := envPricing(env)
				if err != nil {
					return Result{}, err
				}
				if !set {
					// No price configured: defer (not recorded, not blocking).
					return Result{Summary: "MIGRATE_PRICING_ETB not set; set it (santim) to seed the default plan", Deferred: true}, nil
				}
				return MigratePricing(ctx, env, o)
			},
		},
	}
}
