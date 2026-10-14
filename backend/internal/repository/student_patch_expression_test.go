package repository

import (
	"strings"
	"testing"
	"victory-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
)

// Regression guard for "Promoted. 0 students updated." The promote and rename
// patches carry TelegramID because the live student table is keyed on
// (id, telegram_id); that value must only ever TARGET the row. A SET clause
// that names a key attribute is rejected outright by DynamoDB ("Cannot update
// attribute telegram_id. This attribute is part of the key"), and the usecase
// swallows the per-student error into a log line, so the admin saw a silent
// zero on every promote.

// writableNames returns the real attribute names a SET expression touches.
func writableNames(names map[string]string) map[string]bool {
	out := map[string]bool{}
	for placeholder, real := range names {
		if strings.HasPrefix(placeholder, "#a") {
			out[real] = true
		}
	}
	return out
}

func TestStudentPatchExpressionNeverWritesKeyAttributes(t *testing.T) {
	item, err := attributevalue.MarshalMap(domain.Student{
		ID:         "student-1",
		TelegramID: "843063813",
		RegionID:   "addis-ababa",
		Region:     "Addis Ababa",
		CityID:     "addis-ababa",
		City:       "Addis Ababa",
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	expr, names, values := studentPatchExpression(item, []string{"id", "telegram_id"}, "2026-10-14T00:00:00Z")

	written := writableNames(names)
	for _, banned := range []string{"id", "telegram_id"} {
		if written[banned] {
			t.Fatalf("key attribute %q is in the SET clause: %s", banned, expr)
		}
	}
	for _, want := range []string{"region_id", "region", "city_id", "city"} {
		if !written[want] {
			t.Fatalf("promote patch lost %q, expression: %s", want, expr)
		}
	}
	if !strings.Contains(expr, "#updated_at = :updated_at") {
		t.Fatalf("updated_at is no longer stamped: %s", expr)
	}
	if _, ok := values[":updated_at"]; !ok {
		t.Fatalf("missing :updated_at value")
	}
}

// Fields the caller left at their zero value are "not provided": writing them
// would wipe stored data (issue #31's whole point).
func TestStudentPatchExpressionSkipsZeroValues(t *testing.T) {
	item, err := attributevalue.MarshalMap(domain.Student{
		ID: "student-1", TelegramID: "843063813", Name: "Yoseph",
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	expr, names, _ := studentPatchExpression(item, []string{"id", "telegram_id"}, "2026-10-14T00:00:00Z")

	written := writableNames(names)
	if !written["name"] {
		t.Fatalf("name should be written: %s", expr)
	}
	for _, banned := range []string{"id", "telegram_id", "grade", "city", "region"} {
		if written[banned] {
			t.Fatalf("%q must stay untouched by a patch that never set it: %s", banned, expr)
		}
	}
}

// An "id"-only table (the fallback shape) keeps working exactly as before.
func TestStudentPatchExpressionSingleKeyTable(t *testing.T) {
	item, err := attributevalue.MarshalMap(domain.Student{ID: "student-1", TelegramID: "843063813"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	_, names, _ := studentPatchExpression(item, []string{"id"}, "2026-10-14T00:00:00Z")
	if !writableNames(names)["telegram_id"] {
		t.Fatalf("on an id-only table telegram_id is a normal, writable attribute")
	}
}
