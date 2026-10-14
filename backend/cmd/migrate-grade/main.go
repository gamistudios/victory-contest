// Command migrate-grade runs the grade 1-4 -> 9-12 migration by hand (plan D1).
// The same logic runs automatically on boot as migration 20261014-001
// (internal/migrations); this wrapper is for dry-run inspection.
//
//	go run ./cmd/migrate-grade            # dry run + report
//	go run ./cmd/migrate-grade -apply     # write (JSON backup first)
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
	apply := flag.Bool("apply", false, "write the changes; without it the tool only reports")
	table := flag.String("table", "student", "student table name")
	backupDir := flag.String("backup-dir", "", "backup directory (default migration-backups)")
	flag.Parse()
	if _, err := os.Stat(".env"); err == nil {
		_ = godotenv.Load()
	}
	ctx := context.Background()
	cfg, err := awsconfig.Load(ctx)
	if err != nil {
		log.Fatalf("load aws config: %v", err)
	}
	env := migrations.Env{DB: awsconfig.DynamoClient(cfg), Apply: *apply, BackupDir: *backupDir, Out: os.Stdout, Getenv: os.Getenv}
	res, err := migrations.MigrateGrade(ctx, env, *table)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(res.Summary)
}
