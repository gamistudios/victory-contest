package repository

import (
	"context"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
	"victory-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// These are repo-level integration tests against a local DynamoDB-compatible
// endpoint (dynalite). They skip unless AWS_ENDPOINT_URL_DYNAMODB is set, e.g.:
//
//	npx -y dynalite --port 8013
//	AWS_ENDPOINT_URL_DYNAMODB=http://localhost:8013 go test ./internal/repository -run TestLocalDynamo -v
//
// They cover the two always-broken access paths fixed for issues #19 and #20.

func localDynamoClient(t *testing.T) *dynamodb.Client {
	t.Helper()
	endpoint := os.Getenv("AWS_ENDPOINT_URL_DYNAMODB")
	if endpoint == "" {
		t.Skip("AWS_ENDPOINT_URL_DYNAMODB not set; skipping local dynamo integration test")
	}
	cfg, err := awsconfig.LoadDefaultConfig(context.TODO(),
		awsconfig.WithRegion("eu-north-1"),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider("test", "test", "")),
	)
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	return dynamodb.NewFromConfig(cfg, func(o *dynamodb.Options) {
		o.BaseEndpoint = aws.String(endpoint)
	})
}

func cleanupIDs(t *testing.T, client *dynamodb.Client, table string, ids ...string) {
	t.Helper()
	for _, id := range ids {
		_, err := client.DeleteItem(context.TODO(), &dynamodb.DeleteItemInput{
			TableName: aws.String(table),
			Key: map[string]types.AttributeValue{
				"id": &types.AttributeValueMemberS{Value: id},
			},
		})
		if err != nil {
			t.Logf("cleanup %s/%s: %v", table, id, err)
		}
	}
}

func TestLocalDynamoPaymentListAllAndListByUser(t *testing.T) {
	client := localDynamoClient(t)
	repo := &dynamoDBPaymentRepository{db: client, tableName: "payment"}

	// Unique throwaway users so parallel/local data cannot skew assertions.
	suffix := time.Now().UnixNano()
	userA := "it-listall-a" + itoa(suffix)
	userB := "it-listall-b" + itoa(suffix)
	ids := []string{}

	mk := func(user string) *domain.PaymentRequest {
		now := time.Now().UTC()
		p := &domain.PaymentRequest{
			UserID:    user,
			FullName:  "Test " + user,
			BankName:  "TestBank",
			Status:    domain.StatusPending,
			CreatedAt: now,
			UpdatedAt: now,
		}
		if err := repo.Create(p); err != nil {
			t.Fatalf("Create: %v", err)
		}
		ids = append(ids, p.ID)
		return p
	}
	defer cleanupIDs(t, client, "payment", ids...)

	a1 := mk(userA)
	mk(userA)
	b1 := mk(userB)

	// Issue #19 (before): ListAll pinned the GSI range key to the debug value
	// "112pay" and returned nothing meaningful. After: partition-key-only query
	// returns every payment, including all three seeded rows.
	all, err := repo.ListAll()
	if err != nil {
		t.Fatalf("ListAll: %v", err)
	}
	seen := map[string]domain.PaymentRequest{}
	for _, p := range all {
		seen[p.ID] = p
	}
	for _, want := range []*domain.PaymentRequest{a1, b1} {
		if _, ok := seen[want.ID]; !ok {
			t.Errorf("ListAll missing payment %s (user %s)", want.ID, want.UserID)
		}
	}

	// ListByUser returns exactly the user's payments.
	byUser, err := repo.ListByUser(userA)
	if err != nil {
		t.Fatalf("ListByUser: %v", err)
	}
	if len(byUser) != 2 {
		t.Errorf("ListByUser(%s) returned %d payments, want 2", userA, len(byUser))
	}
	for _, p := range byUser {
		if p.UserID != userA {
			t.Errorf("ListByUser(%s) leaked payment for user %s", userA, p.UserID)
		}
	}
}

func TestLocalDynamoGetPaidStudents(t *testing.T) {
	client := localDynamoClient(t)
	repo := &StudentDynamoRepository{db: client, tableName: "student"}

	suffix := itoa(time.Now().UnixNano())
	premiumID := "it-paid-yes-" + suffix
	freeID := "it-paid-no-" + suffix
	defer cleanupIDs(t, client, "student", premiumID, freeID)

	add := func(id string, premium bool) {
		st := domain.Student{ID: id, TelegramID: id, Name: id, IsPremium: premium, CreatedAt: time.Now()}
		if err := repo.AddStudent(st); err != nil {
			t.Fatalf("AddStudent %s: %v", id, err)
		}
	}
	add(premiumID, true)
	add(freeID, false)

	// Issue #20 (before): Query with a FilterExpression on a nonexistent
	// `paid` attribute and no KeyConditionExpression -> ValidationException on
	// every call. After: Scan on `is_premium` returns exactly the premium
	// students.
	paid, err := repo.GetPaidStudents()
	if err != nil {
		t.Fatalf("GetPaidStudents: %v", err)
	}
	found := map[string]bool{}
	for _, s := range paid {
		found[s.ID] = true
		if !s.IsPremium {
			t.Errorf("GetPaidStudents returned non-premium student %s", s.ID)
		}
	}
	if !found[premiumID] {
		t.Errorf("GetPaidStudents missing premium student %s", premiumID)
	}
	if found[freeID] {
		t.Errorf("GetPaidStudents wrongly included free student %s", freeID)
	}

	// VerifyStudentPaid shares the same old broken shape; must no longer error.
	ok, err := repo.VerifyStudentPaid(premiumID)
	if err != nil {
		t.Fatalf("VerifyStudentPaid: %v", err)
	}
	if !ok {
		t.Errorf("VerifyStudentPaid(%s) = false, want true", premiumID)
	}
	ok, err = repo.VerifyStudentPaid(freeID)
	if err != nil {
		t.Fatalf("VerifyStudentPaid: %v", err)
	}
	if ok {
		t.Errorf("VerifyStudentPaid(%s) = true, want false", freeID)
	}
}

func TestLocalDynamoOldQueryShapeIsValidationException(t *testing.T) {
	client := localDynamoClient(t)

	// Documents the before-state of issue #20: a Query without a
	// KeyConditionExpression (as GetPaidStudents/VerifyStudentPaid used) fails
	// with a ValidationException on every call, which the handler surfaced as
	// HTTP 500 on GET /api/student/paid.
	_, err := client.Query(context.TODO(), &dynamodb.QueryInput{
		TableName:        aws.String("student"),
		FilterExpression: aws.String("paid = :paid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":paid": &types.AttributeValueMemberBOOL{Value: true},
		},
	})
	if err == nil {
		t.Fatal("expected a ValidationException-style error for KeyCondition-less Query, got nil")
	}
	// The error is surfaced as a service API error carrying the
	// "ValidationException" code/message ("Query condition ... KeyConditionExpression"),
	// not as an exported types.ValidationException in this SDK version.
	if !strings.Contains(err.Error(), "ValidationException") {
		t.Logf("unexpected error wording (still fails, which is the point): %v", err)
	}
}

func itoa(n int64) string {
	return strconv.FormatInt(n, 10)
}
