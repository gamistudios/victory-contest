package repository

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
	"victor-contest-go/internal/domain"
	usecase "victor-contest-go/internal/usecase"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// Issue #31 regression tests. Integration cases run against dynalite when
// AWS_ENDPOINT_URL_DYNAMODB is set and skip otherwise, mirroring
// dynamo_local_test.go, e.g.:
//
//	npx -y dynalite --port 8016
//	AWS_ENDPOINT_URL_DYNAMODB=http://localhost:8016 go test ./internal/repository -run Issue31 -v

func TestIssue31AddStudentRejectsDuplicateTelegramID(t *testing.T) {
	client := localDynamoClient(t)
	repo := &StudentDynamoRepository{db: client, tableName: "student"}

	suffix := itoa(time.Now().UnixNano())
	idA := "it31-dup-a-" + suffix
	idB := "it31-dup-b-" + suffix
	tele := "9" + suffix // numeric, telegram-id-shaped
	defer cleanupIDs(t, client, "student", idA, idB)

	first := domain.Student{ID: idA, TelegramID: tele, Name: "Ada", CreatedAt: time.Now()}
	if err := repo.AddStudent(first); err != nil {
		t.Fatalf("first AddStudent: %v", err)
	}

	second := domain.Student{ID: idB, TelegramID: tele, Name: "Ada Again", CreatedAt: time.Now()}
	err := repo.AddStudent(second)
	if !errors.Is(err, usecase.ErrStudentAlreadyExists) {
		t.Fatalf("second AddStudent err = %v, want usecase.ErrStudentAlreadyExists", err)
	}

	// The duplicate write must not have created a second row.
	count, err := countByTelegramID(client, tele)
	if err != nil {
		t.Fatalf("count scan: %v", err)
	}
	if count != 1 {
		t.Errorf("telegram_id %s has %d student rows, want 1", tele, count)
	}
}

func TestIssue31UpdateStudentPreservesUntouchedAttributes(t *testing.T) {
	client := localDynamoClient(t)
	repo := &StudentDynamoRepository{db: client, tableName: "student"}

	suffix := itoa(time.Now().UnixNano())
	id := "it31-patch-" + suffix
	defer cleanupIDs(t, client, "student", id)

	full := domain.Student{
		ID:                id,
		TelegramID:        "8" + suffix,
		Name:              "Grace",
		Age:               "17",
		Grade:             "11",
		School:            "School 42",
		City:              "Tallinn",
		Region:            "Harju",
		PhoneNumber:       "+37255555555",
		Gender:            "f",
		Badge:             []string{"fast starter"},
		DefaultScoreRange: "80-90",
		CreatedAt:         time.Now(),
	}
	if err := repo.AddStudent(full); err != nil {
		t.Fatalf("AddStudent: %v", err)
	}

	// A stale writer changes ONLY the phone number (everything else zero).
	patch := domain.Student{ID: id, PhoneNumber: "+37266666666"}
	if err := repo.UpdateStudent(patch); err != nil {
		t.Fatalf("UpdateStudent: %v", err)
	}

	got, err := repo.GetStudentByID(id)
	if err != nil {
		t.Fatalf("GetStudentByID: %v", err)
	}
	if got == nil {
		t.Fatal("student row vanished")
	}
	if got.PhoneNumber != "+37266666666" {
		t.Errorf("PhoneNumber = %q, want the patched value", got.PhoneNumber)
	}
	// The old whole-item PutItem wiped every attribute the caller left empty.
	if got.Name != full.Name || got.Age != full.Age || got.Grade != full.Grade ||
		got.School != full.School || got.City != full.City || got.Region != full.Region ||
		got.Gender != full.Gender || got.DefaultScoreRange != full.DefaultScoreRange ||
		got.TelegramID != full.TelegramID {
		t.Errorf("untouched scalar attributes were clobbered: %+v", got)
	}
	if len(got.Badge) != 1 || got.Badge[0] != "fast starter" {
		t.Errorf("Badge = %v, want [fast starter]", got.Badge)
	}
	if got.CreatedAt.IsZero() {
		t.Error("created_at was wiped (zero time)")
	}

	// updated_at audit stamp is present in the raw item.
	raw, err := readRawItem(client, id)
	if err != nil {
		t.Fatalf("GetItem: %v", err)
	}
	if _, ok := raw["updated_at"]; !ok {
		t.Error("updated_at attribute missing after UpdateStudent")
	}
	for _, wiped := range []string{"name", "grade", "school", "city", "badge", "defaultScoreRange"} {
		if _, ok := raw[wiped]; !ok {
			t.Errorf("raw item lost attribute %q", wiped)
		}
	}
}

// TestIssue31EmptyTelegramIDStillRejected guards the pre-existing validation:
// an empty telegram_id fails with the "required" error, not the new duplicate
// error, and without touching DynamoDB.
func TestIssue31EmptyTelegramIDStillRejected(t *testing.T) {
	repo := &StudentDynamoRepository{tableName: "student"}
	err := repo.AddStudent(domain.Student{TelegramID: ""})
	if err == nil {
		t.Fatal("expected an error for empty telegram_id, got nil")
	}
	if errors.Is(err, usecase.ErrStudentAlreadyExists) {
		t.Errorf("empty telegram_id must not map to already-exists: %v", err)
	}
	if !strings.Contains(err.Error(), "telegram_id is required") {
		t.Errorf("err = %v, want the telegram_id required error", err)
	}
}

func TestIsZeroAttributeValue(t *testing.T) {
	cases := []struct {
		av   types.AttributeValue
		zero bool
	}{
		{&types.AttributeValueMemberS{Value: ""}, true},
		{&types.AttributeValueMemberS{Value: "x"}, false},
		{&types.AttributeValueMemberBOOL{Value: false}, true},
		{&types.AttributeValueMemberBOOL{Value: true}, false},
		{&types.AttributeValueMemberNULL{}, true},
		{&types.AttributeValueMemberL{}, true},
		{&types.AttributeValueMemberL{Value: []types.AttributeValue{&types.AttributeValueMemberS{}}}, false},
		{&types.AttributeValueMemberM{}, true},
		{&types.AttributeValueMemberM{Value: map[string]types.AttributeValue{"k": &types.AttributeValueMemberS{}}}, false},
		{&types.AttributeValueMemberN{Value: "0"}, false},
	}
	for i, c := range cases {
		if got := isZeroAttributeValue(c.av); got != c.zero {
			t.Errorf("case %d: isZeroAttributeValue(%T) = %v, want %v", i, c.av, got, c.zero)
		}
	}
}

func countByTelegramID(client *dynamodb.Client, telegramID string) (int, error) {
	teleIDVal, _ := attributevalue.Marshal(telegramID)
	out, err := client.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("student"),
		FilterExpression: aws.String("telegram_id = :t"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":t": teleIDVal,
		},
	})
	if err != nil {
		return 0, err
	}
	return len(out.Items), nil
}

func readRawItem(client *dynamodb.Client, id string) (map[string]types.AttributeValue, error) {
	out, err := client.GetItem(context.TODO(), &dynamodb.GetItemInput{
		TableName: aws.String("student"),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: id},
		},
	})
	if err != nil {
		return nil, err
	}
	return out.Item, nil
}
