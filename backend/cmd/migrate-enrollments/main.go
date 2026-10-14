// Command migrate-enrollments runs the legacy-student enrollment migration by
// hand (plan 5.2). The same logic runs automatically on boot as migration
// 20261014-002; this wrapper is for dry-run inspection.
//
//	go run ./cmd/migrate-enrollments            # report
//	go run ./cmd/migrate-enrollments -apply
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
	apply := flag.Bool("apply", false, "write changes (default: dry run)")
	table := flag.String("table", "student", "student table")
	backupDir := flag.String("backup-dir", "", "backup directory (default migration-backups)")
	flag.Parse()
	if _, err := os.Stat(".env"); err == nil {
		_ = godotenv.Load()
	}
	ctx := context.Background()
	cfg, err := awsconfig.Load(ctx)
	if err != nil {
		log.Fatal(err)
	}
	env := migrations.Env{DB: awsconfig.DynamoClient(cfg), Apply: *apply, BackupDir: *backupDir, Out: os.Stdout, Getenv: os.Getenv}
	res, err := migrations.MigrateEnrollments(ctx, env, *table)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(res.Summary)
}
