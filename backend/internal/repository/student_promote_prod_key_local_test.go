package repository

import (
	"context"
	"errors"
	"testing"
	"time"
	"victory-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// End-to-end regression for the reported bug: promoting a misspelled city
// ("Addis abeba" -> "Addis Ababa") answered "Promoted. 0 students updated."
// forever. The live student table is keyed on (id HASH, telegram_id RANGE) and
// the promote patch carries telegram_id, so the old code emitted
// "SET telegram_id = ..." — DynamoDB rejects that whole write with
// "Cannot update attribute telegram_id. This attribute is part of the key",
// the usecase logged and continued, and every student silently stayed put.
//
// This file reproduces the PRODUCTION key shape (not the id/created_at shape of
// student_composite_key_local_test.go) and asserts the student-visible
// predicate: the row really carries the promoted ids and spelling afterwards.

const prodKeyStudentTable = "student_prod_key_shape_it"

func ensureProdKeyStudentTable(t *testing.T, client *dynamodb.Client) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	_, err := client.CreateTable(ctx, &dynamodb.CreateTableInput{
		TableName:   aws.String(prodKeyStudentTable),
		BillingMode: types.BillingModePayPerRequest,
		AttributeDefinitions: []types.AttributeDefinition{
			{AttributeName: aws.String("id"), AttributeType: types.ScalarAttributeTypeS},
			{AttributeName: aws.String("telegram_id"), AttributeType: types.ScalarAttributeTypeS},
		},
		KeySchema: []types.KeySchemaElement{
			{AttributeName: aws.String("id"), KeyType: types.KeyTypeHash},
			{AttributeName: aws.String("telegram_id"), KeyType: types.KeyTypeRange},
		},
	})
	if err != nil {
		var exists *types.ResourceInUseException
		if !errors.As(err, &exists) {
			t.Fatalf("create prod-shaped student table: %v", err)
		}
	}
	deadline := time.Now().Add(10 * time.Second)
	for {
		out, err := client.DescribeTable(ctx, &dynamodb.DescribeTableInput{TableName: aws.String(prodKeyStudentTable)})
		if err == nil && out.Table != nil && out.Table.TableStatus == types.TableStatusActive {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("wait for table: last err %v", err)
		}
		time.Sleep(200 * time.Millisecond)
	}
}

func TestLocalDynamoPromotePatchWritesProdKeyShapeRow(t *testing.T) {
	client := localDynamoClient(t)
	ensureProdKeyStudentTable(t, client)
	repo := NewStudentDynamoRepository(client, prodKeyStudentTable)

	suffix := itoa(time.Now().UnixNano())
	id := "it-promote-" + suffix
	tele := "84306381" + suffix[len(suffix)-2:]
	seed := domain.Student{
		ID: id, TelegramID: tele, Name: "Yoseph", PhoneNumber: "+251911223344",
		// What a free-text registrant actually stores: names only, no ids.
		Region: "Addis Ababa", City: "Addis abeba",
		CreatedAt: time.Now().UTC().Truncate(time.Second),
	}
	if err := repo.AddStudent(seed); err != nil {
		t.Fatalf("AddStudent: %v", err)
	}
	defer func() { _ = repo.DeleteStudent(id) }()

	// Exactly the patch PromoteLocation builds.
	patch := domain.Student{
		ID: id, TelegramID: tele,
		RegionID: "addis-ababa", Region: "Addis Ababa",
		CityID: "addis-ababa", City: "Addis Ababa",
	}
	if err := repo.UpdateStudent(patch); err != nil {
		t.Fatalf("UpdateStudent with a promote patch on the prod key shape: %v", err)
	}

	got, err := repo.GetStudentByID(id)
	if err != nil {
		t.Fatalf("GetStudentByID: %v", err)
	}
	if got == nil {
		t.Fatal("row vanished")
	}
	if got.RegionID != "addis-ababa" || got.CityID != "addis-ababa" {
		t.Fatalf("promote did not link the stable ids: %+v", got)
	}
	if got.City != "Addis Ababa" {
		t.Fatalf("spelling not corrected on the student row: %q", got.City)
	}
	// The key must be untouched, and fields the patch never mentioned kept.
	if got.TelegramID != tele {
		t.Fatalf("telegram_id (a key attribute) was rewritten: %q", got.TelegramID)
	}
	if got.Name != "Yoseph" || got.PhoneNumber != "+251911223344" {
		t.Fatalf("patch clobbered untouched fields: %+v", got)
	}
}

// A patch that only knows the id (the enrollment flows) must still reach the
// right row on a composite-key table: the range key is lifted from the stored
// row rather than demanded from the caller.
func TestLocalDynamoUpdateWithoutTelegramIDOnProdKeyShape(t *testing.T) {
	client := localDynamoClient(t)
	ensureProdKeyStudentTable(t, client)
	repo := NewStudentDynamoRepository(client, prodKeyStudentTable)

	suffix := itoa(time.Now().UnixNano())
	id := "it-enroll-" + suffix
	if err := repo.AddStudent(domain.Student{
		ID: id, TelegramID: "77" + suffix, Name: "Abel", Grade: "12",
		CreatedAt: time.Now().UTC().Truncate(time.Second),
	}); err != nil {
		t.Fatalf("AddStudent: %v", err)
	}
	defer func() { _ = repo.DeleteStudent(id) }()

	if err := repo.UpdateStudent(domain.Student{ID: id, PrimaryProgramID: "grade-12"}); err != nil {
		t.Fatalf("UpdateStudent without telegram_id on a composite table: %v", err)
	}
	got, err := repo.GetStudentByID(id)
	if err != nil {
		t.Fatalf("GetStudentByID: %v", err)
	}
	if got == nil || got.PrimaryProgramID != "grade-12" {
		t.Fatalf("primary_program_id not persisted: %+v", got)
	}
	if got == nil || got.Grade != "12" {
		t.Fatalf("grade wiped by the patch: %+v", got)
	}
}
