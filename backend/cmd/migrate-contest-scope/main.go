// Command migrate-contest-scope runs the contest scope back-fill by hand (plan 10.2). Dry run by default; NOT run on boot.
// Review the dry-run report before using -apply.
//
//	go run ./cmd/migrate-contest-scope            # dry run + report
//	go run ./cmd/migrate-contest-scope -apply     # write (JSON backup first)
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
	table := flag.String("table", "contests", "contest table name")
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
	res, err := migrations.MigrateContestScope(ctx, env, *table)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(res.Summary)
}
