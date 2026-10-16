package repository

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// Exercises the three conditional writes the attempt engine's safety rests on
// (plan §5.4.2): the race-free deterministic id, the version-checked autosave,
// and the single-winner finalise. Skips unless a local DynamoDB is running:
//
//	npx -y dynalite --port 8013
//	AWS_ENDPOINT_URL_DYNAMODB=http://localhost:8013 go test ./internal/repository -run TestLocalDynamoAttempt -v

const itAttemptTable = "it_attempts"

func TestLocalDynamoAttemptConditionals(t *testing.T) {
	if os.Getenv("AWS_ENDPOINT_URL_DYNAMODB") == "" {
		t.Skip("AWS_ENDPOINT_URL_DYNAMODB not set; skipping local dynamo integration test")
	}
	client := localDynamoClient(t)
	ctx := context.TODO()

	suffix := time.Now().UnixNano()
	id := fmt.Sprintf("itc%d#its%d#1", suffix, suffix)
	_, err := client.CreateTable(ctx, &dynamodb.CreateTableInput{
		TableName: aws.String(itAttemptTable),
		KeySchema: []types.KeySchemaElement{{AttributeName: aws.String("id"), KeyType: types.KeyTypeHash}},
		AttributeDefinitions: []types.AttributeDefinition{
			{AttributeName: aws.String("id"), AttributeType: types.ScalarAttributeTypeS},
			{AttributeName: aws.String("contest_id"), AttributeType: types.ScalarAttributeTypeS},
			{AttributeName: aws.String("student_id"), AttributeType: types.ScalarAttributeTypeS},
			{AttributeName: aws.String("status"), AttributeType: types.ScalarAttributeTypeS},
			{AttributeName: aws.String("expires_at"), AttributeType: types.ScalarAttributeTypeS},
		},
		GlobalSecondaryIndexes: []types.GlobalSecondaryIndex{
			{IndexName: aws.String("contest_id-index"), KeySchema: []types.KeySchemaElement{{AttributeName: aws.String("contest_id"), KeyType: types.KeyTypeHash}}, Projection: &types.Projection{ProjectionType: types.ProjectionTypeAll}},
			{IndexName: aws.String("student_id-index"), KeySchema: []types.KeySchemaElement{{AttributeName: aws.String("student_id"), KeyType: types.KeyTypeHash}}, Projection: &types.Projection{ProjectionType: types.ProjectionTypeAll}},
			{IndexName: aws.String("status-expires_at-index"), KeySchema: []types.KeySchemaElement{{AttributeName: aws.String("status"), KeyType: types.KeyTypeHash}, {AttributeName: aws.String("expires_at"), KeyType: types.KeyTypeRange}}, Projection: &types.Projection{ProjectionType: types.ProjectionTypeAll}},
		},
		BillingMode: types.BillingModePayPerRequest,
	})
	if err != nil {
		t.Fatalf("create table: %v", err)
	}
	defer func() {
		if _, err := client.DeleteTable(ctx, &dynamodb.DeleteTableInput{TableName: aws.String(itAttemptTable)}); err != nil {
			t.Logf("delete table: %v", err)
		}
	}()
	deadline := time.Now().Add(20 * time.Second)
	for {
		d, err := client.DescribeTable(ctx, &dynamodb.DescribeTableInput{TableName: aws.String(itAttemptTable)})
		if err == nil && d.Table != nil && d.Table.TableStatus == types.TableStatusActive {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("wait table: %v", err)
		}
		time.Sleep(200 * time.Millisecond)
	}

	repo := NewAttemptDynamoRepository(client, itAttemptTable)
	a := domain.Attempt{
		ID: id, ContestID: fmt.Sprintf("itc%d", suffix), StudentID: fmt.Sprintf("its%d", suffix),
		Mode: domain.ContestModeSelfPaced, Status: domain.AttemptInProgress,
		StartedAt: t0str(), ExpiresAt: t0str(),
	}

	// conditional create: first wins, second sees the existing row
	if err := repo.Create(a); err != nil {
		t.Fatalf("create: %v", err)
	}
	if err := repo.Create(a); err != usecase.ErrAlreadyAttempted {
		t.Fatalf("duplicate create: got %v, want ErrAlreadyAttempted", err)
	}

	// version-checked autosave: exactly the expected version writes
	if err := repo.UpdateAnswers(id, map[string]int{"q1": 1}, []string{"q2"}, 0); err != nil {
		t.Fatalf("autosave v0: %v", err)
	}
	if err := repo.UpdateAnswers(id, map[string]int{"q1": 2}, nil, 0); err != usecase.ErrVersionConflict {
		t.Fatalf("stale autosave: got %v, want ErrVersionConflict", err)
	}
	if err := repo.UpdateAnswers(id, map[string]int{"q1": 1, "q2": 2}, nil, 1); err != nil {
		t.Fatalf("autosave v1: %v", err)
	}
	got, err := repo.Get(id)
	if err != nil || got.AnswersVersion != 2 || got.Answers["q2"] != 2 {
		t.Fatalf("get after autosaves: %+v err=%v", got, err)
	}

	// conditional finalise: single winner (submit vs sweeper)
	fin := *got
	fin.Status = domain.AttemptSubmitted
	if err := repo.Finalise(fin); err != nil {
		t.Fatalf("finalise: %v", err)
	}
	again := fin
	again.Status = domain.AttemptAutoSubmitted
	if err := repo.Finalise(again); err != usecase.ErrAttemptFinalised {
		t.Fatalf("double finalise: got %v, want ErrAttemptFinalised", err)
	}
	if err := repo.UpdateAnswers(id, map[string]int{"q1": 9}, nil, 2); err != usecase.ErrVersionConflict {
		t.Fatalf("autosave after finalise must fail the status condition: got %v", err)
	}

	// GSI queries see the row
	byContest, err := repo.ListByContest(a.ContestID)
	if err != nil {
		t.Fatalf("ListByContest: %v", err)
	}
	if len(byContest) != 1 || byContest[0].ID != id {
		t.Fatalf("ListByContest = %+v", byContest)
	}

	// sweeper index: only in_progress rows with expires_at before the cutoff
	a2 := a
	a2.ID = fmt.Sprintf("itc%d#its2#1", suffix)
	a2.StudentID = fmt.Sprintf("its2-%d", suffix)
	if err := repo.Create(a2); err != nil {
		t.Fatalf("create second attempt: %v", err)
	}
	expired, err := repo.ListExpired(time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		t.Fatalf("ListExpired: %v", err)
	}
	if len(expired) != 1 || expired[0].ID != a2.ID {
		t.Fatalf("sweeper must see the open attempt only: %+v", expired)
	}
}

func t0str() string { return time.Now().UTC().Add(-time.Hour).Format(time.RFC3339) }
