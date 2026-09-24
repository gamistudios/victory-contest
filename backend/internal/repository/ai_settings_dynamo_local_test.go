package repository

import (
	"context"
	"errors"
	"testing"
	"time"
	"victor-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// Ensures the ai_settings table exists on the local dynalite endpoint
// (mirrors cmd/setup-tables: id hash key, PAY_PER_REQUEST).
func ensureAiSettingsTable(t *testing.T, client *dynamodb.Client) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	_, err := client.CreateTable(ctx, &dynamodb.CreateTableInput{
		TableName:   aws.String("ai_settings"),
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
			t.Fatalf("create ai_settings: %v", err)
		}
	}
	deadline := time.Now().Add(10 * time.Second)
	for {
		out, err := client.DescribeTable(ctx, &dynamodb.DescribeTableInput{
			TableName: aws.String("ai_settings"),
		})
		if err == nil && out.Table != nil && out.Table.TableStatus == types.TableStatusActive {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("wait ai_settings: last err %v", err)
		}
		time.Sleep(200 * time.Millisecond)
	}
}

// The single settings row round-trips through both switch positions, and a
// table that has never been written to reads back the default (false).
func TestLocalDynamoAiSettingsRoundTrip(t *testing.T) {
	client := localDynamoClient(t)
	ensureAiSettingsTable(t, client)
	repo := NewAiSettingsDynamoRepository(client, "ai_settings")

	// Delete the fixed id first so "never written" is deterministic even if
	// an earlier suite run left the row behind.
	cleanupIDs(t, client, "ai_settings", domain.AISettingsID)

	got, err := repo.GetSettings()
	if err != nil {
		t.Fatalf("GetSettings on empty table: %v", err)
	}
	if got.RequirePremium {
		t.Fatalf("missing row must read as require_premium=false, got %+v", got)
	}

	for _, want := range []bool{true, false} {
		if err := repo.SaveSettings(domain.AISettings{RequirePremium: want}); err != nil {
			t.Fatalf("SaveSettings(%v): %v", want, err)
		}
		got, err := repo.GetSettings()
		if err != nil {
			t.Fatalf("GetSettings: %v", err)
		}
		if got.ID != domain.AISettingsID {
			t.Fatalf("id = %q, want %q", got.ID, domain.AISettingsID)
		}
		if got.RequirePremium != want {
			t.Fatalf("round-trip = %v, want %v", got.RequirePremium, want)
		}
	}
	cleanupIDs(t, client, "ai_settings", domain.AISettingsID)
}
