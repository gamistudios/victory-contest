package migrations

import (
	"context"
	"errors"
	"io"
	"os"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// The boot logs of the live deployment were full of
//
//	migrations: update <id> failed: ... ValidationException: The provided key
//	element does not match the schema
//	data migration incomplete (applied []): 20261014-001-grade-9-12: 148 grade
//	updates failed
//
// because the data migrations targeted rows with a hardcoded {id} key while the
// production student table is keyed on (id, telegram_id). These tests run the
// real write loops against that production key shape.

const migStudentTable = "student_migrations_prod_key_it"

func migClient(t *testing.T) *dynamodb.Client {
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
		t.Fatalf("load aws config: %v", err)
	}
	return dynamodb.NewFromConfig(cfg, func(o *dynamodb.Options) {
		o.BaseEndpoint = aws.String(endpoint)
	})
}

func ensureMigStudentTable(t *testing.T, client *dynamodb.Client) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	_, err := client.CreateTable(ctx, &dynamodb.CreateTableInput{
		TableName:   aws.String(migStudentTable),
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
			t.Fatalf("create table: %v", err)
		}
	}
	deadline := time.Now().Add(10 * time.Second)
	for {
		out, err := client.DescribeTable(ctx, &dynamodb.DescribeTableInput{TableName: aws.String(migStudentTable)})
		if err == nil && out.Table != nil && out.Table.TableStatus == types.TableStatusActive {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("wait for table: last err %v", err)
		}
		time.Sleep(200 * time.Millisecond)
	}
}

func putStudent(t *testing.T, client *dynamodb.Client, item map[string]types.AttributeValue) {
	t.Helper()
	if _, err := client.PutItem(context.TODO(), &dynamodb.PutItemInput{
		TableName: aws.String(migStudentTable), Item: item,
	}); err != nil {
		t.Fatalf("seed: %v", err)
	}
}

func gradeOf(t *testing.T, client *dynamodb.Client, id string) string {
	t.Helper()
	out, err := client.Query(context.TODO(), &dynamodb.QueryInput{
		TableName:              aws.String(migStudentTable),
		KeyConditionExpression: aws.String("id = :id"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":id": &types.AttributeValueMemberS{Value: id},
		},
	})
	if err != nil || len(out.Items) == 0 {
		t.Fatalf("read back %s: %v", id, err)
	}
	var g struct {
		Grade string `dynamodbav:"grade"`
	}
	if err := attributevalue.UnmarshalMap(out.Items[0], &g); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	return g.Grade
}

func TestLocalDynamoGradeMigrationOnProdKeyShape(t *testing.T) {
	client := migClient(t)
	ensureMigStudentTable(t, client)

	id1 := "it-mig-grade-1"
	putStudent(t, client, map[string]types.AttributeValue{
		"id": strAttr(id1), "telegram_id": strAttr("843063813"), "grade": strAttr("1"),
	})
	t.Cleanup(func() {
		_, _ = client.DeleteItem(context.TODO(), &dynamodb.DeleteItemInput{
			TableName: aws.String(migStudentTable),
			Key: map[string]types.AttributeValue{
				"id": strAttr(id1), "telegram_id": strAttr("843063813"),
			},
		})
	})

	dir := t.TempDir()
	res, err := MigrateGrade(context.TODO(), Env{
		DB: client, Apply: true, BackupDir: dir, Out: io.Discard,
		Getenv: func(string) string { return "" },
	}, migStudentTable)
	if err != nil {
		t.Fatalf("MigrateGrade on the prod key shape: %v (summary %q)", err, res.Summary)
	}
	if got := gradeOf(t, client, id1); got != "9" {
		t.Fatalf("legacy grade %q was not migrated to 9", got)
	}
}

func TestLocalDynamoEnrollmentMigrationOnProdKeyShape(t *testing.T) {
	client := migClient(t)
	ensureMigStudentTable(t, client)

	id := "it-mig-enroll-1"
	tele := "55667788"
	putStudent(t, client, map[string]types.AttributeValue{
		"id": strAttr(id), "telegram_id": strAttr(tele), "grade": strAttr("12"),
	})
	t.Cleanup(func() {
		_, _ = client.DeleteItem(context.TODO(), &dynamodb.DeleteItemInput{
			TableName: aws.String(migStudentTable),
			Key: map[string]types.AttributeValue{
				"id": strAttr(id), "telegram_id": strAttr(tele),
			},
		})
	})

	res, err := MigrateEnrollments(context.TODO(), Env{
		DB: client, Apply: true, BackupDir: t.TempDir(), Out: io.Discard,
		Getenv: func(string) string { return "" },
	}, migStudentTable)
	if err != nil {
		t.Fatalf("MigrateEnrollments on the prod key shape: %v (summary %q)", err, res.Summary)
	}

	out, err := client.Query(context.TODO(), &dynamodb.QueryInput{
		TableName:              aws.String(migStudentTable),
		KeyConditionExpression: aws.String("id = :id"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":id": &types.AttributeValueMemberS{Value: id},
		},
	})
	if err != nil || len(out.Items) == 0 {
		t.Fatalf("read back: %v", err)
	}
	var st struct {
		Primary string `dynamodbav:"primary_program_id"`
	}
	if err := attributevalue.UnmarshalMap(out.Items[0], &st); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if st.Primary != "grade-12" {
		t.Fatalf("enrollment migration wrote nothing usable: %+v", st)
	}
}
