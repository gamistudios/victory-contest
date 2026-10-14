// Command migrate-pricing seeds the default "All access" plan by hand (plan
// 5.12) when price_plans is empty. Amounts are in santim and come from flags:
// NO price is invented. On boot the same logic runs as migration 20261014-004
// when MIGRATE_PRICING_ETB is set.
//
//	go run ./cmd/migrate-pricing -etb 29900            # report
//	go run ./cmd/migrate-pricing -etb 29900 -apply
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
	table := flag.String("table", "price_plans", "plans table")
	etb := flag.Int64("etb", 0, "price in santim (required)")
	days := flag.Int("days", 30, "validity in days")
	flag.Parse()
	if *etb <= 0 {
		log.Fatal("-etb (santim) is required; no default price is invented")
	}
	if _, err := os.Stat(".env"); err == nil {
		_ = godotenv.Load()
	}
	ctx := context.Background()
	cfg, err := awsconfig.Load(ctx)
	if err != nil {
		log.Fatal(err)
	}
	env := migrations.Env{DB: awsconfig.DynamoClient(cfg), Apply: *apply, Out: os.Stdout, Getenv: os.Getenv}
	res, err := migrations.MigratePricing(ctx, env, migrations.PricingOptions{Table: *table, EtbSantim: *etb, Days: *days, UpdatedBy: "migrate-pricing"})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(res.Summary)
}
