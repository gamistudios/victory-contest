package domain

import (
	"testing"

	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// TestModelListUnmarshalLegacy pins the compatibility contract: rows written
// before per-model limits existed store plain strings, and they must keep
// loading alongside the current map entries.
func TestModelListUnmarshalLegacy(t *testing.T) {
	legacy, err := attributevalue.MarshalList([]string{"gemini-2.5-flash", "gpt-4o"})
	if err != nil {
		t.Fatalf("marshal legacy: %v", err)
	}
	var fromLegacy ModelList
	if err := fromLegacy.UnmarshalDynamoDBAttributeValue(&types.AttributeValueMemberL{Value: legacy}); err != nil {
		t.Fatalf("legacy unmarshal: %v", err)
	}
	if len(fromLegacy) != 2 || fromLegacy[0].Name != "gemini-2.5-flash" || fromLegacy[1].Name != "gpt-4o" {
		t.Fatalf("legacy rows = %+v", fromLegacy)
	}

	current, err := attributevalue.MarshalList([]AIModel{
		{Name: "gemini-2.5-flash", ContextWindow: 1_048_576, MaxOutputTokens: 65_536},
		{Name: "legacy-model"},
	})
	if err != nil {
		t.Fatalf("marshal current: %v", err)
	}
	var fromCurrent ModelList
	if err := fromCurrent.UnmarshalDynamoDBAttributeValue(&types.AttributeValueMemberL{Value: current}); err != nil {
		t.Fatalf("current unmarshal: %v", err)
	}
	if len(fromCurrent) != 2 || fromCurrent[0].ContextWindow != 1_048_576 || fromCurrent[0].MaxOutputTokens != 65_536 {
		t.Fatalf("current rows = %+v", fromCurrent)
	}

	provider := AIProvider{Models: fromCurrent}
	if unknown := provider.ResolveModel("unknown"); unknown.ContextWindow != 0 || unknown.MaxOutputTokens != 0 {
		t.Fatal("ResolveModel must fall back to zero limits for unknown names")
	}
	if known := provider.ResolveModel("gemini-2.5-flash"); known.ContextWindow != 1_048_576 {
		t.Fatalf("ResolveModel lost the context window: %+v", known)
	}
	if err := fromLegacy.UnmarshalDynamoDBAttributeValue(&types.AttributeValueMemberS{Value: "x"}); err == nil {
		t.Fatal("non-list attribute must be rejected")
	}
}
