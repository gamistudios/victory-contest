package migrations

import (
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// Regression guard for the boot-migration failure in the live logs:
// "migrations: update <telegram id> failed: ... The provided key element does
// not match the schema" (148 rows for 20261014-001). The student table is
// keyed on (id, telegram_id), so a hardcoded {id} key is a partial key and
// every write is rejected — the migration never records, so it retries and
// fails on each boot. fullKey is what the write loops now use instead.
func TestFullKeyLiftsEveryKeyAttribute(t *testing.T) {
	item := map[string]types.AttributeValue{
		"id":          strAttr("student-1"),
		"telegram_id": strAttr("843063813"),
		"grade":       strAttr("12"),
	}

	key, err := fullKey([]string{"id", "telegram_id"}, item)
	if err != nil {
		t.Fatalf("fullKey: %v", err)
	}
	if len(key) != 2 {
		t.Fatalf("key is not the complete primary key: %v", key)
	}
	for name, want := range map[string]string{"id": "student-1", "telegram_id": "843063813"} {
		av, ok := key[name]
		if !ok {
			t.Fatalf("key attribute %q missing", name)
		}
		got, isS := av.(*types.AttributeValueMemberS)
		if !isS || got.Value != want {
			t.Fatalf("key attribute %q = %#v, want %q", name, av, want)
		}
	}

	// A row that cannot supply a key attribute must fail loudly rather than
	// send a partial key that DynamoDB rejects with a confusing schema error.
	if _, err := fullKey([]string{"id", "created_at"}, item); err == nil {
		t.Fatal("expected an error for a missing key attribute")
	}
}
