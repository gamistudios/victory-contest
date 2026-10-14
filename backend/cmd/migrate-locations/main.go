// Command migrate-locations stores the embedded region/city seed by hand
// (plan 5.1). The same logic runs automatically on boot as migration
// 20261014-003. It never overwrites an existing stored list.
//
//	go run ./cmd/migrate-locations          # report
//	go run ./cmd/migrate-locations -apply
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"

	"victory-contest-go/internal/awsconfig"
	"victory-contest-go/internal/migrations"

	"github.com/joho/godotenv"
)

func main() {
	apply := flag.Bool("apply", false, "write (default: dry run)")
	table := flag.String("table", "reference_data", "reference data table")
	flag.Parse()
	if _, err := os.Stat(".env"); err == nil {
		_ = godotenv.Load()
	}
	ctx := context.Background()
	cfg, err := awsconfig.Load(ctx)
	if err != nil {
		log.Fatal(err)
	}
	env := migrations.Env{DB: awsconfig.DynamoClient(cfg), Apply: *apply, Out: os.Stdout, Getenv: os.Getenv}
	res, err := migrations.MigrateLocations(ctx, env, *table)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(res.Summary)
}
