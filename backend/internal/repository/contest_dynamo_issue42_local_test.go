package repository

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"victory-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// TestLocalDynamoQuestionsStoredAsList covers #42 end-to-end against dynalite:
// insert and update must both store `questions` as a DynamoDB list ("L"), in
// order and with duplicates intact.
//
//	AWS_ENDPOINT_URL_DYNAMODB=http://localhost:8018 go test ./internal/repository -run TestLocalDynamoQuestions -v
func TestLocalDynamoQuestionsStoredAsList(t *testing.T) {
	if os.Getenv("AWS_ENDPOINT_URL_DYNAMODB") == "" {
		t.Skip("AWS_ENDPOINT_URL_DYNAMODB not set; skipping local dynamo integration test")
	}
	client := localDynamoClient(t)
	repo := &ContestDynamoRepository{db: client, tableName: "contests"}

	id := fmt.Sprintf("it-questions-%d", time.Now().UnixNano())
	defer cleanupIDs(t, client, "contests", id)

	stored := func(why string) map[string]types.AttributeValue {
		t.Helper()
		out, err := client.GetItem(context.TODO(), &dynamodb.GetItemInput{
			TableName:      aws.String("contests"),
			Key:            map[string]types.AttributeValue{"id": &types.AttributeValueMemberS{Value: id}},
			ConsistentRead: aws.Bool(true),
		})
		if err != nil {
			t.Fatalf("get item (%s): %v", why, err)
		}
		return out.Item
	}
	wantList := func(item map[string]types.AttributeValue, why string, want ...string) {
		t.Helper()
		raw, ok := item["questions"]
		if !ok {
			t.Fatalf("%s: questions attribute missing", why)
		}
		t.Logf("%s: raw dynalite questions attribute type = %T", why, raw)
		if _, isSet := raw.(*types.AttributeValueMemberSS); isSet {
			t.Fatalf("%s: questions stored as SS, want L", why)
		}
		list, ok := raw.(*types.AttributeValueMemberL)
		if !ok {
			t.Fatalf("%s: questions stored as %T, want L", why, raw)
		}
		if len(list.Value) != len(want) {
			t.Fatalf("%s: questions = %d entries, want %d", why, len(list.Value), len(want))
		}
		for i, member := range list.Value {
			s, ok := member.(*types.AttributeValueMemberS)
			if !ok {
				t.Fatalf("%s: questions[%d] is %T, want S", why, i, member)
			}
			if s.Value != want[i] {
				t.Fatalf("%s: questions = %v, want %v (order/duplicates lost)", why, s.Value, want[i])
			}
		}
	}

	inserted := domain.Contest{
		ID:        id,
		Title:     "Questions type",
		Grade:     "5",
		Questions: []string{"q-dup", "q-second", "q-dup"},
	}
	if _, err := repo.AddContest(inserted); err != nil {
		t.Fatalf("AddContest: %v", err)
	}
	wantList(stored("after insert"), "after insert", "q-dup", "q-second", "q-dup")

	// Update must keep using the same type and must apply the new list.
	updated := inserted
	updated.Questions = []string{"z", "y", "z", "x"}
	if err := repo.UpdateContest(id, updated); err != nil {
		t.Fatalf("UpdateContest: %v", err)
	}
	wantList(stored("after update"), "after update", "z", "y", "z", "x")

	// An update that carries no list must not wipe the stored one.
	scalarOnly := inserted
	scalarOnly.Title = "Renamed"
	scalarOnly.Questions = nil
	if err := repo.UpdateContest(id, scalarOnly); err != nil {
		t.Fatalf("UpdateContest (scalar only): %v", err)
	}
	wantList(stored("after scalar-only update"), "after scalar-only update", "z", "y", "z", "x")

	got, err := repo.GetContestByID(id)
	if err != nil {
		t.Fatalf("GetContestByID: %v", err)
	}
	if got == nil || got.Title != "Renamed" {
		t.Fatalf("GetContestByID = %+v", got)
	}

	// Legacy rows written by the old update path are stored as SS; readers have
	// to decode them instead of erroring.
	legacyID := id + "-legacy"
	defer cleanupIDs(t, client, "contests", legacyID)
	putLegacySSRow(t, client, legacyID, "legacy-1", "legacy-2")

	legacy, err := repo.GetContestByID(legacyID)
	if err != nil {
		t.Fatalf("GetContestByID on legacy SS row: %v", err)
	}
	if legacy == nil || len(legacy.Questions) != 2 {
		t.Fatalf("legacy SS row not readable: %+v", legacy)
	}
	// Touching such a row through Update normalises it back to a list.
	lu := *legacy
	lu.Questions = []string{"legacy-2", "legacy-1"}
	if err := repo.UpdateContest(legacyID, lu); err != nil {
		t.Fatalf("UpdateContest on legacy row: %v", err)
	}
	item := rawItem(t, client, legacyID, "after legacy update")
	if _, ok := item["questions"].(*types.AttributeValueMemberL); !ok {
		t.Fatalf("legacy row not normalised to L: %T", item["questions"])
	}
}

// TestLocalDynamoLegacySSRowStaysReadable leaves a legacy SS row behind under a
// fixed id so the running API (GET /api/contest/) can be pointed at it too.
// It is skipped unless a local endpoint is configured.
func TestLocalDynamoLegacySSRowStaysReadable(t *testing.T) {
	if os.Getenv("AWS_ENDPOINT_URL_DYNAMODB") == "" {
		t.Skip("AWS_ENDPOINT_URL_DYNAMODB not set; skipping local dynamo integration test")
	}
	client := localDynamoClient(t)
	repo := &ContestDynamoRepository{db: client, tableName: "contests"}

	const legacyID = "it42-legacy-ss-row"
	putLegacySSRow(t, client, legacyID, "legacy-1", "legacy-2")
	defer cleanupIDs(t, client, "contests", legacyID)

	legacy, err := repo.GetContestByID(legacyID)
	if err != nil {
		t.Fatalf("GetContestByID on legacy SS row: %v", err)
	}
	if legacy == nil || len(legacy.Questions) != 2 {
		t.Fatalf("legacy SS row not readable through the repo: %+v", legacy)
	}
	all, err := repo.GetAllContests()
	if err != nil {
		t.Fatalf("GetAllContests (table also holds an SS row): %v", err)
	}
	for _, c := range all {
		if c.ID == legacyID && len(c.Questions) != 2 {
			t.Fatalf("Scan path lost the legacy questions: %+v", c)
		}
	}
}

func putLegacySSRow(t *testing.T, client *dynamodb.Client, id string, questions ...string) {
	t.Helper()
	if _, err := client.PutItem(context.TODO(), &dynamodb.PutItemInput{
		TableName: aws.String("contests"),
		Item: map[string]types.AttributeValue{
			"id":        &types.AttributeValueMemberS{Value: id},
			"title":     &types.AttributeValueMemberS{Value: "Legacy SS row (#42)"},
			"grade":     &types.AttributeValueMemberS{Value: "5"},
			"questions": &types.AttributeValueMemberSS{Value: questions},
		},
	}); err != nil {
		t.Fatalf("put legacy SS row: %v", err)
	}
}

func rawItem(t *testing.T, client *dynamodb.Client, id, why string) map[string]types.AttributeValue {
	t.Helper()
	out, err := client.GetItem(context.TODO(), &dynamodb.GetItemInput{
		TableName:      aws.String("contests"),
		Key:            map[string]types.AttributeValue{"id": &types.AttributeValueMemberS{Value: id}},
		ConsistentRead: aws.Bool(true),
	})
	if err != nil {
		t.Fatalf("get item (%s): %v", why, err)
	}
	return out.Item
}
