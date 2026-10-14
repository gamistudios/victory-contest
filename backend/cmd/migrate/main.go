// Command migrate lists or runs the versioned data migrations by hand, the
// same runner the API executes on boot.
//
//	go run ./cmd/migrate -status   # applied / pending
//	go run ./cmd/migrate           # run every pending migration in id order
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"sort"

	"victory-contest-go/internal/awsconfig"
	"victory-contest-go/internal/migrations"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/joho/godotenv"
)

func main() {
	status := flag.Bool("status", false, "only list applied and pending migrations")
	flag.Parse()
	if _, err := os.Stat(".env"); err == nil {
		_ = godotenv.Load()
	}
	ctx := context.Background()
	cfg, err := awsconfig.Load(ctx)
	if err != nil {
		log.Fatal(err)
	}
	db := awsconfig.DynamoClient(cfg)
	reg := migrations.Registry()
	if *status {
		applied := map[string]migrations.Applied{}
		if out, err := db.Scan(ctx, &dynamodb.ScanInput{TableName: aws.String(migrations.TableName)}); err == nil {
			for _, it := range out.Items {
				var a migrations.Applied
				if attributevalue.UnmarshalMap(it, &a) == nil && a.Status == "applied" {
					applied[a.ID] = a
				}
			}
		}
		ids := make([]string, 0, len(reg))
		for _, m := range reg {
			ids = append(ids, m.ID)
		}
		sort.Strings(ids)
		for _, id := range ids {
			if a, ok := applied[id]; ok {
				fmt.Printf("applied  %s  %s  %s\n", id, a.AppliedAt, a.Summary)
			} else {
				fmt.Printf("pending  %s\n", id)
			}
		}
		return
	}
	done, err := migrations.RunPending(ctx, db, reg, migrations.Env{Out: os.Stdout, BackupDir: os.Getenv("MIGRATION_BACKUP_DIR")})
	fmt.Println("applied:", done)
	if err != nil {
		log.Fatal(err)
	}
}
