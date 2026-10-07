package repository

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"
	"victory-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// Regression guard for the live "provided key element does not match the
// schema" failure: the deployed student table is NOT keyed on a bare `id`
// hash key — it carries a range key as well (id + created_at). UpdateItem /
// DeleteItem / SetSuspended must reconstruct the table's COMPLETE key, and
// the schema-aware fullKeyFor does that by describing the table and lifting
// every key attribute from the stored row. This test provisions a composite
// table on the local dynalite endpoint and exercises all three write paths.

const compositeStudentTable = "student_composite_key_it"

func ensureCompositeStudentTable(t *testing.T, client *dynamodb.Client) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	_, err := client.CreateTable(ctx, &dynamodb.CreateTableInput{
		TableName:   aws.String(compositeStudentTable),
		BillingMode: types.BillingModePayPerRequest,
		AttributeDefinitions: []types.AttributeDefinition{
			{AttributeName: aws.String("id"), AttributeType: types.ScalarAttributeTypeS},
			{AttributeName: aws.String("created_at"), AttributeType: types.ScalarAttributeTypeS},
		},
		KeySchema: []types.KeySchemaElement{
			{AttributeName: aws.String("id"), KeyType: types.KeyTypeHash},
			{AttributeName: aws.String("created_at"), KeyType: types.KeyTypeRange},
		},
	})
	if err != nil {
		var exists *types.ResourceInUseException
		if !errors.As(err, &exists) {
			t.Fatalf("create composite student table: %v", err)
		}
	}
	deadline := time.Now().Add(10 * time.Second)
	for {
		out, err := client.DescribeTable(ctx, &dynamodb.DescribeTableInput{
			TableName: aws.String(compositeStudentTable),
		})
		if err == nil && out.Table != nil && out.Table.TableStatus == types.TableStatusActive {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("wait composite student table: last err %v", err)
		}
		time.Sleep(200 * time.Millisecond)
	}
}

// TestLocalDynamoCompositeKeyStudentWrites proves that, on a table whose
// primary key is a composite (id hash + created_at range) — not a bare `id`
// hash — every student write path still works because it rebuilds the full
// key from the live schema instead of hardcoding {id}. A pre-fix repo would
// send a partial {id} key and hit a key-schema ValidationException.
func TestLocalDynamoCompositeKeyStudentWrites(t *testing.T) {
	client := localDynamoClient(t)
	ensureCompositeStudentTable(t, client)
	repo := NewStudentDynamoRepository(client, compositeStudentTable)

	// Unique row so parallel/local data can't skew the assertions.
	suffix := itoa(time.Now().UnixNano())
	id := "it-comp-" + suffix
	st := domain.Student{ID: id, TelegramID: id, Name: "Composite", CreatedAt: time.Now().UTC().Truncate(time.Second)}
	// The composite table's range key is created_at; the repo omits it from
	// UpdateItem only when it is the zero value, so seed a concrete one here
	// (and it is required for the row to be complete under the schema).
	if err := repo.AddStudent(st); err != nil {
		t.Fatalf("AddStudent: %v", err)
	}
	defer func() {
		_ = repo.DeleteStudent(id)
	}()

	// 1) Update: patch a non-zero field. Must succeed under a composite key.
	phone := "+3721112233"
	upd := domain.Student{ID: id, PhoneNumber: phone}
	if err := repo.UpdateStudent(upd); err != nil {
		t.Fatalf("UpdateStudent on composite-key table: %v", err)
	}
	got, err := repo.GetStudentByID(id)
	if err != nil {
		t.Fatalf("GetStudentByID after update: %v", err)
	}
	if got == nil || got.PhoneNumber != phone {
		t.Fatalf("update did not persist phone (got %+v)", got)
	}

	// 2) Suspend true, then reactivate (false) — both directions must work.
	if err := repo.SetSuspended(id, true); err != nil {
		t.Fatalf("SetSuspended(true): %v", err)
	}
	got, _ = repo.GetStudentByID(id)
	if got == nil || !got.IsSuspended {
		t.Fatalf("isSuspended not set (got %+v)", got)
	}
	if err := repo.SetSuspended(id, false); err != nil {
		t.Fatalf("SetSuspended(false): %v", err)
	}
	got, _ = repo.GetStudentByID(id)
	if got == nil || got.IsSuspended {
		t.Fatalf("isSuspended not cleared (got %+v)", got)
	}

	// 3) Delete must remove the row under a composite key.
	if err := repo.DeleteStudent(id); err != nil {
		t.Fatalf("DeleteStudent: %v", err)
	}
	deleted, err := repo.GetStudentByID(id)
	if err != nil {
		t.Fatalf("GetStudentByID after delete: %v", err)
	}
	if deleted != nil {
		t.Fatalf("row still present after delete: %+v", deleted)
	}
}

// A bare {id} key is what the pre-fix repo sent; document that it is rejected
// by a composite-key table, so the regression is unambiguous if it returns.
func TestLocalDynamoCompositeKeyRejectsPartialKey(t *testing.T) {
	client := localDynamoClient(t)
	ensureCompositeStudentTable(t, client)

	suffix := itoa(time.Now().UnixNano())
	id := "it-comp-partial-" + suffix
	// Seed a complete row (both key attributes present) so the partial-key
	// failure is purely a key-shape problem, not a missing-row problem.
	created := time.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
	_, err := client.PutItem(context.TODO(), &dynamodb.PutItemInput{
		TableName: aws.String(compositeStudentTable),
		Item: map[string]types.AttributeValue{
			"id":         &types.AttributeValueMemberS{Value: id},
			"created_at": &types.AttributeValueMemberS{Value: created},
			"name":       &types.AttributeValueMemberS{Value: "Partial"},
		},
	})
	if err != nil {
		t.Fatalf("seed row: %v", err)
	}
	defer func() {
		_, _ = client.DeleteItem(context.TODO(), &dynamodb.DeleteItemInput{
			TableName: aws.String(compositeStudentTable),
			Key: map[string]types.AttributeValue{
				"id":         &types.AttributeValueMemberS{Value: id},
				"created_at": &types.AttributeValueMemberS{Value: created},
			},
		})
	}()

	// The old, pre-fix delete shape: only the hash key, no range key.
	_, err = client.DeleteItem(context.TODO(), &dynamodb.DeleteItemInput{
		TableName: aws.String(compositeStudentTable),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: id},
		},
	})
	if err == nil {
		t.Fatalf("expected a key-schema error for a partial {id} key, got nil (dynalite lenient?)")
	} else {
		t.Logf("partial-key delete rejected as expected: %v", fmt.Sprint(err))
	}
}
