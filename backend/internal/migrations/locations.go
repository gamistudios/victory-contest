package migrations

import (
	"context"
	"fmt"

	"victory-contest-go/internal/repository"
	"victory-contest-go/internal/usecase"
)

// MigrateLocations stores the embedded region/city seed in reference_data
// when nothing is stored yet. It never overwrites an existing list.
func MigrateLocations(ctx context.Context, env Env, table string) (Result, error) {
	if table == "" {
		table = "reference_data"
	}
	store := repository.NewLocationDynamoStore(env.DB, table)
	cur, err := store.Load()
	if err != nil {
		return Result{}, err
	}
	if cur != nil && len(cur.Regions) > 0 {
		return Result{Summary: fmt.Sprintf("already stored (%d regions)", len(cur.Regions))}, nil
	}
	seed := usecase.DefaultLocations()
	if !env.Apply {
		return Result{Summary: fmt.Sprintf("would store %d regions (nothing written)", len(seed.Regions))}, nil
	}
	if err := store.Save(seed); err != nil {
		return Result{}, err
	}
	return Result{Summary: fmt.Sprintf("stored %d regions", len(seed.Regions))}, nil
}
