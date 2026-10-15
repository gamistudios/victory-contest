// Command migrate-location-dedupe reports or applies the repair of migration
// 20261014-005 by hand: the stored list reduced to one entry per city, and every
// student relinked onto that entry.
//
//	go run ./cmd/migrate-location-dedupe          # report only, nothing written
//	go run ./cmd/migrate-location-dedupe -apply
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
	refTable := flag.String("reference-table", "reference_data", "reference data table")
	studentTable := flag.String("student-table", "student", "student table")
	backup := flag.String("backup-dir", os.Getenv("MIGRATION_BACKUP_DIR"), "where the JSON backup is written")
	flag.Parse()
	if _, err := os.Stat(".env"); err == nil {
		_ = godotenv.Load()
	}
	ctx := context.Background()
	cfg, err := awsconfig.Load(ctx)
	if err != nil {
		log.Fatal(err)
	}
	env := migrations.Env{DB: awsconfig.DynamoClient(cfg), Apply: *apply,
		BackupDir: *backup, Out: os.Stdout, Getenv: os.Getenv}
	res, err := migrations.MigrateLocationDedupe(ctx, env, *refTable, *studentTable)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(res.Summary)
}
