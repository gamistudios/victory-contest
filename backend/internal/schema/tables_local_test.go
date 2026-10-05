package schema

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// Integration tests against a local DynamoDB-compatible endpoint (dynalite).
// They skip unless AWS_ENDPOINT_URL_DYNAMODB is set, e.g.:
//
//	npx -y dynalite --port 8013
//	AWS_ENDPOINT_URL_DYNAMODB=http://localhost:8013 go test ./internal/schema -v

func localClient(t *testing.T) *dynamodb.Client {
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

func dropTable(t *testing.T, client *dynamodb.Client, name string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, _ = client.DeleteTable(ctx, &dynamodb.DeleteTableInput{TableName: aws.String(name)})
}

func tableGSINames(t *testing.T, client *dynamodb.Client, name string) map[string]bool {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	out, err := client.DescribeTable(ctx, &dynamodb.DescribeTableInput{TableName: aws.String(name)})
	if err != nil {
		t.Fatalf("describe %s: %v", name, err)
	}
	names := map[string]bool{}
	for _, g := range out.Table.GlobalSecondaryIndexes {
		names[aws.ToString(g.IndexName)] = true
	}
	return names
}

// TestEnsureTablesCreatesWaitsAndIsIdempotent: missing tables are created
// with their GSIs, the waiter returns only once they are ACTIVE, and a
// second run is a no-op.
func TestEnsureTablesCreatesWaitsAndIsIdempotent(t *testing.T) {
	client := localClient(t)
	defs := []Table{
		{Name: "schema_test_plain"},
		{Name: "schema_test_indexed", GSIs: []GSI{
			{Name: "owner-index", Partition: "owner", PartType: types.ScalarAttributeTypeS},
			{Name: "owner-created-index", Partition: "owner", Sort: "createdAt",
				PartType: types.ScalarAttributeTypeS, SortType: types.ScalarAttributeTypeS},
		}},
	}
	for _, def := range defs {
		dropTable(t, client, def.Name)
		defer dropTable(t, client, def.Name)
	}

	created, err := EnsureTables(context.Background(), client, defs)
	if err != nil {
		t.Fatalf("EnsureTables: %v", err)
	}
	if len(created) != 2 {
		t.Fatalf("created %v, want both tables", created)
	}
	// The waiter guarantees ACTIVE + all GSIs ready, so these describes see
	// the final state.
	got := tableGSINames(t, client, "schema_test_indexed")
	if !got["owner-index"] || !got["owner-created-index"] {
		t.Fatalf("GSIs missing after creation: %v", got)
	}

	created2, err := EnsureTables(context.Background(), client, defs)
	if err != nil {
		t.Fatalf("second EnsureTables: %v", err)
	}
	if len(created2) != 0 {
		t.Fatalf("second run recreated %v — not idempotent", created2)
	}
}

// TestEnsureTablesAddsMissingGSIToExistingTable covers the drift case: the
// table predates a GSI (or was created by hand) and the migration extends it.
func TestEnsureTablesAddsMissingGSIToExistingTable(t *testing.T) {
	client := localClient(t)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	dropTable(t, client, "schema_test_drift")
	defer dropTable(t, client, "schema_test_drift")
	if _, err := client.CreateTable(ctx, &dynamodb.CreateTableInput{
		TableName:            aws.String("schema_test_drift"),
		BillingMode:          types.BillingModePayPerRequest,
		AttributeDefinitions: []types.AttributeDefinition{{AttributeName: aws.String("id"), AttributeType: types.ScalarAttributeTypeS}},
		KeySchema: []types.KeySchemaElement{
			{AttributeName: aws.String("id"), KeyType: types.KeyTypeHash},
		},
	}); err != nil {
		t.Fatalf("seed table: %v", err)
	}

	def := Table{Name: "schema_test_drift", GSIs: []GSI{
		{Name: "email-id-index", Partition: "email", PartType: types.ScalarAttributeTypeS},
	}}
	created, err := EnsureTables(context.Background(), client, []Table{def})
	if err != nil {
		t.Fatalf("EnsureTables: %v", err)
	}
	if len(created) != 0 {
		t.Fatalf("existing table reported as created: %v", created)
	}
	if got := tableGSINames(t, client, "schema_test_drift"); !got["email-id-index"] {
		t.Fatalf("missing GSI was not added: %v", got)
	}
}
