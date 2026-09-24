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

// Ensures the payment_settings table exists on the local dynalite endpoint
// (mirrors cmd/setup-tables: id hash key, PAY_PER_REQUEST).
func ensurePaymentSettingsTable(t *testing.T, client *dynamodb.Client) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	_, err := client.CreateTable(ctx, &dynamodb.CreateTableInput{
		TableName:   aws.String("payment_settings"),
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
			t.Fatalf("create payment_settings: %v", err)
		}
	}
	deadline := time.Now().Add(10 * time.Second)
	for {
		out, err := client.DescribeTable(ctx, &dynamodb.DescribeTableInput{
			TableName: aws.String("payment_settings"),
		})
		if err == nil && out.Table != nil && out.Table.TableStatus == types.TableStatusActive {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("wait payment_settings: last err %v", err)
		}
		time.Sleep(200 * time.Millisecond)
	}
}

// The single settings row round-trips both switch positions and the amount,
// and a table never written to reads back the default (allow_stars = false).
func TestLocalDynamoPaymentSettingsRoundTrip(t *testing.T) {
	client := localDynamoClient(t)
	ensurePaymentSettingsTable(t, client)
	repo := NewPaymentSettingsDynamoRepository(client, "payment_settings")

	cleanupIDs(t, client, "payment_settings", domain.PaymentSettingsID)

	got, err := repo.GetSettings()
	if err != nil {
		t.Fatalf("GetSettings on empty table: %v", err)
	}
	if got.AllowStars {
		t.Fatalf("missing row must read as allow_stars=false, got %+v", got)
	}

	for _, want := range []bool{true, false} {
		if err := repo.SaveSettings(domain.PaymentSettings{AllowStars: want, StarsAmount: 75}); err != nil {
			t.Fatalf("SaveSettings(%v): %v", want, err)
		}
		got, err := repo.GetSettings()
		if err != nil {
			t.Fatalf("GetSettings: %v", err)
		}
		if got.ID != domain.PaymentSettingsID {
			t.Fatalf("id = %q, want %q", got.ID, domain.PaymentSettingsID)
		}
		if got.AllowStars != want {
			t.Fatalf("round-trip allow_stars = %v, want %v", got.AllowStars, want)
		}
		if got.StarsAmount != 75 {
			t.Fatalf("round-trip stars_amount = %d, want 75", got.StarsAmount)
		}
	}
	cleanupIDs(t, client, "payment_settings", domain.PaymentSettingsID)
}
