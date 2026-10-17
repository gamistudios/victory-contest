// Command backfill-leaderboard rebuilds the precomputed leaderboard rows from the attempts table (plan 10.5).
// Dry run by default; NOT run on boot. Legacy submissions without an attempt are not replayed here.
//
//	go run ./cmd/backfill-leaderboard            # dry run: counts students and attempts
//	go run ./cmd/backfill-leaderboard -apply     # recompute and write every student's rows
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"

	"victory-contest-go/internal/awsconfig"
	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/repository"
	"victory-contest-go/internal/usecase"

	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/joho/godotenv"
)

func main() {
	apply := flag.Bool("apply", false, "write the boards; without it the tool only reports")
	flag.Parse()
	if _, err := os.Stat(".env"); err == nil {
		_ = godotenv.Load()
	}
	ctx := context.Background()
	cfg, err := awsconfig.Load(ctx)
	if err != nil {
		log.Fatalf("load aws config: %v", err)
	}
	ddb := awsconfig.DynamoClient(cfg)

	// One latest attempt per student is enough: Record recomputes from all of that student's attempts.
	latest := map[string]domain.Attempt{}
	total := 0
	pager := dynamodb.NewScanPaginator(ddb, &dynamodb.ScanInput{TableName: strPtr("attempts")})
	for pager.HasMorePages() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			log.Fatalf("scan attempts: %v", err)
		}
		var items []domain.Attempt
		if err := attributevalue.UnmarshalListOfMaps(page.Items, &items); err != nil {
			log.Fatalf("decode attempts: %v", err)
		}
		for _, a := range items {
			total++
			if !a.Finalised() || a.Scope == nil {
				continue
			}
			if cur, ok := latest[a.StudentID]; !ok || a.SubmittedAt > cur.SubmittedAt {
				latest[a.StudentID] = a
			}
		}
	}
	fmt.Printf("attempts=%d students-with-finalised-scoped-attempts=%d apply=%v\n", total, len(latest), *apply)
	if !*apply {
		return
	}
	lb := usecase.NewLeaderboardUsecase(repository.NewLeaderboardDynamoRepository(ddb, "leaderboard"),
		repository.NewAttemptDynamoRepository(ddb, "attempts"), repository.NewStudentDynamoRepository(ddb, "student"))
	for _, a := range latest {
		lb.Record(a)
	}
	fmt.Println("done")
}

func strPtr(s string) *string { return &s }
