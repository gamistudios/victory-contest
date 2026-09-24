package repository

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
	"victory-contest-go/internal/awsconfig"
	"victory-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// Tests for README §9 issue #41: Scan/Query reads must follow
// LastEvaluatedKey until the result is exhausted instead of silently
// returning the first 1 MB page.

// TestScanPagesAssemblesMultiplePages seeds three tiny rows and scans them
// with a deliberately fake-small page (Limit=1), so every page carries a
// LastEvaluatedKey. The old single-Scan shape returned one row; scanPages
// must thread ExclusiveStartKey through and return all three.
func TestScanPagesAssemblesMultiplePages(t *testing.T) {
	client := localDynamoClient(t)
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()

	suffix := itoa(time.Now().UnixNano())
	prefix := "it41-q-" + suffix
	repo := &QuestionDynamoRepository{db: client, tableName: "question"}
	ids := make([]string, 0, 3)
	for i := 1; i <= 3; i++ {
		id := prefix + itoa(int64(i))
		if _, err := repo.AddQuestion(domain.Question{ID: id, QuestionText: "paged", Subject: "it41"}); err != nil {
			t.Fatalf("AddQuestion: %v", err)
		}
		ids = append(ids, id)
	}
	defer cleanupIDs(t, client, "question", ids...)

	newInput := func() *dynamodb.ScanInput {
		return &dynamodb.ScanInput{
			TableName:        aws.String("question"),
			FilterExpression: aws.String("begins_with(#qid, :prefix)"),
			ExpressionAttributeNames: map[string]string{
				"#qid": "id",
			},
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":prefix": &types.AttributeValueMemberS{Value: prefix},
			},
			Limit: aws.Int32(1), // fake-small page: forces LastEvaluatedKey
		}
	}

	// Sanity: one raw Scan with this input really is truncated. Limit
	// bounds EVALUATED items before the filter applies, so the first page
	// carries a continuation key (possibly with 0 matching items).
	first, err := client.Scan(ctx, newInput())
	if err != nil {
		t.Fatalf("raw Scan: %v", err)
	}
	if first.LastEvaluatedKey == nil {
		t.Fatalf("raw single Scan returned no continuation key (%d items); test needs a multi-page input", len(first.Items))
	}

	items, err := scanPages(ctx, client, newInput())
	if err != nil {
		t.Fatalf("scanPages: %v", err)
	}
	if len(items) != 3 {
		seen := make([]string, 0, len(items))
		for _, it := range items {
			if av, ok := it["id"].(*types.AttributeValueMemberS); ok {
				seen = append(seen, av.Value)
			}
		}
		t.Fatalf("scanPages returned %d items (%v), want all 3 across pages", len(items), seen)
	}
}

// TestQueryPagesAssemblesMultiplePages is the Query counterpart: three
// payments for one throwaway user queried through their GSI partition with
// Limit=1 pages.
func TestQueryPagesAssemblesMultiplePages(t *testing.T) {
	client := localDynamoClient(t)
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()

	repo := &dynamoDBPaymentRepository{db: client, tableName: "payment"}
	user := "it41-user-" + itoa(time.Now().UnixNano())
	ids := make([]string, 0, 3)
	for i := 0; i < 3; i++ {
		now := time.Now().UTC()
		p := &domain.PaymentRequest{UserID: user, FullName: "Paged " + user, BankName: "TestBank", Status: domain.StatusPending, CreatedAt: now, UpdatedAt: now}
		if err := repo.Create(p); err != nil {
			t.Fatalf("Create: %v", err)
		}
		ids = append(ids, p.ID)
	}
	defer cleanupIDs(t, client, "payment", ids...)

	newInput := func() *dynamodb.QueryInput {
		return &dynamodb.QueryInput{
			TableName:              aws.String("payment"),
			IndexName:              aws.String("GSI1PK-user_id-index"),
			KeyConditionExpression: aws.String("GSI1PK = :pk AND #st = :user"),
			ExpressionAttributeNames: map[string]string{
				"#st": "user_id",
			},
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":pk":   &types.AttributeValueMemberS{Value: "PAYMENT_REQUEST"},
				":user": &types.AttributeValueMemberS{Value: user},
			},
			Limit: aws.Int32(1), // fake-small page: forces LastEvaluatedKey
		}
	}

	first, err := client.Query(ctx, newInput())
	if err != nil {
		t.Fatalf("raw Query: %v", err)
	}
	if first.LastEvaluatedKey == nil || len(first.Items) >= 3 {
		t.Fatalf("raw single Query was not truncated (items=%d, continuation key=%v); test needs a multi-page input", len(first.Items), first.LastEvaluatedKey != nil)
	}

	items, err := queryPages(ctx, client, newInput())
	if err != nil {
		t.Fatalf("queryPages: %v", err)
	}
	if len(items) != 3 {
		t.Fatalf("queryPages returned %d items, want all 3 across pages", len(items))
	}
}

// TestGetAllQuestionsAssemblesLargeRowsAcrossPages wires the paging loop
// through a real repository method: three ~380 KB question rows exceed the
// 1 MB Scan page cap, so a single-page read cannot return all of them.
func TestGetAllQuestionsAssemblesLargeRowsAcrossPages(t *testing.T) {
	client := localDynamoClient(t)
	repo := &QuestionDynamoRepository{db: client, tableName: "question"}

	suffix := itoa(time.Now().UnixNano())
	bulk := strings.Repeat("x", 380*1024) // near the 400 KB item cap
	ids := make([]string, 0, 3)
	for i := 1; i <= 3; i++ {
		id := "it41-big-" + suffix + itoa(int64(i))
		if _, err := repo.AddQuestion(domain.Question{ID: id, QuestionText: bulk, Subject: "it41-big"}); err != nil {
			t.Fatalf("AddQuestion %s: %v", id, err)
		}
		ids = append(ids, id)
	}
	defer cleanupIDs(t, client, "question", ids...)

	// Document (not require) that one raw Scan page is truncated: if the
	// local backend honors the 1 MB limit, LastEvaluatedKey is set and the
	// legacy single-page shape demonstrably lost rows.
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	raw, err := client.Scan(ctx, &dynamodb.ScanInput{
		TableName:        aws.String("question"),
		FilterExpression: aws.String("#subj = :s"),
		ExpressionAttributeNames: map[string]string{
			"#subj": "subject",
		},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":s": &types.AttributeValueMemberS{Value: "it41-big"},
		},
	})
	if err != nil {
		t.Fatalf("raw Scan: %v", err)
	}
	if raw.LastEvaluatedKey != nil {
		t.Logf("single raw Scan truncated at %d items with a continuation key: legacy shape lost rows", len(raw.Items))
	} else {
		t.Logf("backend did not truncate the raw Scan (%d items); paging still proven by the Limit=1 tests", len(raw.Items))
	}

	// The paged repository method must assemble every seeded row.
	all, err := repo.GetAllQuestions()
	if err != nil {
		if errors.Is(err, errMaxPages) {
			t.Skipf("question table already spans more than %d pages; skipping shared-table assertion", maxPages)
		}
		t.Fatalf("GetAllQuestions: %v", err)
	}
	seen := map[string]bool{}
	for _, q := range all {
		seen[q.ID] = true
	}
	for _, id := range ids {
		if !seen[id] {
			t.Errorf("GetAllQuestions lost %s past the first page (issue #41)", id)
		}
	}
}
