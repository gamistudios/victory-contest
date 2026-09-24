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

// Ensures the ai_providers table exists on the local dynalite endpoint
// (mirrors cmd/setup-tables: id hash key, PAY_PER_REQUEST) so this test runs
// whether or not setup-tables was executed first.
func ensureAiProvidersTable(t *testing.T, client *dynamodb.Client) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	_, err := client.CreateTable(ctx, &dynamodb.CreateTableInput{
		TableName:   aws.String("ai_providers"),
		BillingMode: types.BillingModePayPerRequest,
		AttributeDefinitions: []types.AttributeDefinition{{
			AttributeName: aws.String("id"),
			AttributeType: types.ScalarAttributeTypeS,
		}},
		KeySchema: []types.KeySchemaElement{{
			AttributeName: aws.String("id"), KeyType: types.KeyTypeHash,
		}},
	})
	if err != nil {
		var exists *types.ResourceInUseException
		if !errors.As(err, &exists) {
			t.Fatalf("create ai_providers: %v", err)
		}
	}
	// Poll instead of the SDK waiter: dynalite reports ACTIVE immediately but
	// the TableExists waiter misclassifies its error shapes.
	deadline := time.Now().Add(10 * time.Second)
	for {
		out, err := client.DescribeTable(ctx, &dynamodb.DescribeTableInput{
			TableName: aws.String("ai_providers"),
		})
		if err == nil && out.Table != nil && out.Table.TableStatus == types.TableStatusActive {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("wait ai_providers: last err %v", err)
		}
		time.Sleep(200 * time.Millisecond)
	}
}

func TestLocalDynamoAiProviderCRUD(t *testing.T) {
	client := localDynamoClient(t)
	ensureAiProvidersTable(t, client)
	repo := NewAiProviderDynamoRepository(client, "ai_providers")

	id := "it-aiproviders-" + itoa(time.Now().UnixNano())
	defer cleanupIDs(t, client, "ai_providers", id)

	key := "sk-local-test-key"
	createdID, err := repo.AddProvider(domain.AIProvider{
		ID: id, Name: "probe", BaseURL: "https://api.example.com", APIKey: key,
		Protocol: domain.AIProtocolOpenAI, Models: []string{"m1", "m2"}, Enabled: true,
	})
	if err != nil {
		t.Fatalf("AddProvider: %v", err)
	}
	if createdID != id {
		t.Fatalf("createdID = %s", createdID)
	}

	got, err := repo.GetProviderByID(id)
	if err != nil {
		t.Fatalf("GetProviderByID: %v", err)
	}
	if got == nil {
		t.Fatal("row missing after AddProvider")
	}
	if got.APIKey != key {
		t.Fatalf("api key not round-tripped through dynamodbav: %q", got.APIKey)
	}
	if len(got.Models) != 2 || got.Models[0] != "m1" {
		t.Fatalf("models = %v", got.Models)
	}
	if got.CreatedAt == "" || got.UpdatedAt == "" {
		t.Fatal("timestamps not set on add")
	}

	got.Name = "probe-renamed"
	got.Enabled = false
	if err := repo.UpdateProvider(*got); err != nil {
		t.Fatalf("UpdateProvider: %v", err)
	}
	got2, err := repo.GetProviderByID(id)
	if err != nil || got2 == nil {
		t.Fatalf("GetProviderByID after update: %v", err)
	}
	if got2.Name != "probe-renamed" || got2.Enabled {
		t.Fatalf("update not persisted: %+v", got2)
	}

	all, err := repo.GetAllProviders()
	if err != nil {
		t.Fatalf("GetAllProviders: %v", err)
	}
	found := false
	for _, p := range all {
		if p.ID == id {
			found = true
		}
	}
	if !found {
		t.Fatal("row missing from GetAllProviders scan")
	}

	if err := repo.DeleteProvider(id); err != nil {
		t.Fatalf("DeleteProvider: %v", err)
	}
	gone, err := repo.GetProviderByID(id)
	if err != nil || gone != nil {
		t.Fatalf("row survived delete: %+v %v", gone, err)
	}
}
