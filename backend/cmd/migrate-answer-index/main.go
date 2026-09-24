// Command migrate-answer-index rewrites stored submission rows whose
// missed_questions selections use the losing 0-based answer-index
// convention to the canonical 1-based convention (B6).
//
// Canonical convention (unified 2026-09-24): an option index of 1 means the
// first option (A); a stored value of 0 can therefore never appear in a
// canonical row (-1 is the shared "skipped" sentinel in both conventions).
// Detection is only possible where the data proves itself:
//
//   - selected_answer == 0                 -> row is provably 0-based
//   - selected_answer == len(multiple_choice) (>=1) -> row is provably 1-based
//   - anything strictly inside [1, n-1]    -> valid under BOTH conventions,
//     undetectable: left untouched and only reported.
//
// Rows that mix both proofs are reported as conflicting and never rewritten.
// Converting a provably 0-based row shifts every in-range value by +1 (for
// rows whose question was deleted, every non-negative value is shifted —
// documented per row in the report). Values invalid under both conventions
// (e.g. 9 in a 4-option question, a legacy client's "missed everything"
// marker) are kept as-is.
//
// The tool is DRY-RUN BY DEFAULT: it writes nothing unless -apply is passed,
// and it is idempotent — re-running over already-converted rows is a no-op
// because conversion leaves no 0 behind.
//
// Usage (against the endpoint/credentials in the environment):
//
//	AWS_ENDPOINT_URL_DYNAMODB=http://localhost:8094 go run ./cmd/migrate-answer-index            # dry run
//	AWS_ENDPOINT_URL_DYNAMODB=http://localhost:8094 go run ./cmd/migrate-answer-index -apply     # write
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"victory-contest-go/internal/awsconfig"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/joho/godotenv"
)

// skipSentinel marks a skipped question; identical in both conventions.
const skipSentinel = -1

// missedEntry is one (question id, selected answer) pair plus the attribute
// key spellings the row actually used, so rewrites preserve the stored shape.
type missedEntry struct {
	IDKey   string
	ValKey  string
	ID      string
	Value   int64
	Invalid bool // out of range under BOTH conventions; never shifted
}

type rowStatus int

const (
	statusNoSelections rowStatus = iota // row carries nothing to inspect
	statusCanonical                     // provably canonical; left untouched
	statusUndetectable                  // ambiguous values only; cannot prove
	statusConflicting                   // both conventions proven in one row
	statusConvert                       // provably 0-based; entries shifted
)

func (s rowStatus) String() string {
	switch s {
	case statusNoSelections:
		return "no-selections"
	case statusCanonical:
		return "canonical"
	case statusUndetectable:
		return "undetectable"
	case statusConflicting:
		return "conflicting"
	case statusConvert:
		return "convert"
	}
	return "unknown"
}

type rowResult struct {
	Status  rowStatus
	Entries []missedEntry // post-transform values when Status == statusConvert
	Notes   []string
}

// migrateEntries is the pure migration transform: it detects the convention
// of one submission row from its selections and, only where the row is
// provably 0-based, returns the canonicalized entries. optionCounts maps a
// question id to its number of options; a missing entry means the question
// was deleted and contributes no range evidence.
func migrateEntries(entries []missedEntry, optionCounts map[string]int) rowResult {
	res := rowResult{Entries: entries}

	proofZero := 0
	proofOne := 0
	evidence := 0
	for i, e := range entries {
		n, known := optionCounts[e.ID]
		switch {
		case e.Value == skipSentinel:
			// Shared sentinel: no evidence either way.
		case e.Value == 0:
			// Canonical rows can never hold 0 (validated 1..n at write
			// time), so this proves the 0-based convention even when the
			// question row is gone.
			proofZero++
			evidence++
		case known && int(e.Value) == n:
			// Impossible under 0-based (max index is n-1).
			proofOne++
			evidence++
		case known && e.Value > 0 && int(e.Value) < n:
			// Legal under both conventions: undetectable on its own.
			evidence++
		case known:
			// Outside [0, n]: invalid under both conventions; keep, flag.
			entries[i].Invalid = true
			res.Notes = append(res.Notes,
				fmt.Sprintf("question %s value %d is out of range under both conventions, left as-is", e.ID, e.Value))
		default:
			// Question unknown (deleted) and value > 0: no range evidence.
			evidence++
		}
	}

	switch {
	case proofZero > 0 && proofOne > 0:
		res.Status = statusConflicting
		res.Notes = append(res.Notes, "row mixes 0-based and 1-based evidence; needs manual review")
		return res
	case proofZero > 0:
		out := make([]missedEntry, len(entries))
		for i, e := range entries {
			out[i] = e
			if e.Value == skipSentinel || e.Invalid {
				continue
			}
			if n, known := optionCounts[e.ID]; known && int(e.Value) >= n {
				continue // cannot happen for proven-0-based rows, belt & braces
			}
			out[i].Value = e.Value + 1
		}
		res.Entries = out
		res.Status = statusConvert
		if !allKnown(entries, optionCounts) {
			res.Notes = append(res.Notes, "some question rows were deleted; non-negative values were shifted unconditionally")
		}
		return res
	case proofOne > 0:
		res.Status = statusCanonical
		return res
	case evidence == 0:
		res.Status = statusNoSelections
		return res
	default:
		res.Status = statusUndetectable
		return res
	}
}

func allKnown(entries []missedEntry, optionCounts map[string]int) bool {
	for _, e := range entries {
		if _, ok := optionCounts[e.ID]; !ok {
			return false
		}
	}
	return true
}

// --- DynamoDB (de)serialization ------------------------------------------

var idKeys = []string{"ID", "id", "question_id"}
var valueKeys = []string{"SelectedAnswer", "selected_answer"}

// parseMissedQuestions reads the missed_questions list of a raw submission
// item. attributevalue marshals SubmissionMissedQuestionDto by field name
// (no dynamodbav tags), so the canonical stored keys are ID/SelectedAnswer;
// snake_case spellings are accepted for robustness.
func parseMissedQuestions(item map[string]types.AttributeValue) ([]missedEntry, error) {
	list, ok := item["missed_questions"]
	if !ok {
		return nil, nil
	}
	lv, ok := list.(*types.AttributeValueMemberL)
	if !ok || len(lv.Value) == 0 {
		return nil, nil
	}
	entries := make([]missedEntry, 0, len(lv.Value))
	for _, elem := range lv.Value {
		mv, ok := elem.(*types.AttributeValueMemberM)
		if !ok {
			return nil, fmt.Errorf("missed_questions element is not a map")
		}
		var e missedEntry
		for _, k := range idKeys {
			if s, ok := mv.Value[k].(*types.AttributeValueMemberS); ok {
				e.IDKey, e.ID = k, s.Value
				break
			}
		}
		for _, k := range valueKeys {
			if n, ok := mv.Value[k].(*types.AttributeValueMemberN); ok {
				v, err := parseN(n.Value)
				if err != nil {
					return nil, fmt.Errorf("selected answer %q: %w", n.Value, err)
				}
				e.ValKey, e.Value = k, v
				break
			}
		}
		if e.IDKey == "" || e.ValKey == "" {
			return nil, fmt.Errorf("missed_questions element lacks a recognized id/value key: %v", keysOf(mv.Value))
		}
		entries = append(entries, e)
	}
	return entries, nil
}

func parseN(s string) (int64, error) {
	var v int64
	if _, err := fmt.Sscanf(s, "%d", &v); err != nil {
		return 0, err
	}
	return v, nil
}

func keysOf(m map[string]types.AttributeValue) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func encodeMissedQuestions(entries []missedEntry) types.AttributeValue {
	items := make([]types.AttributeValue, 0, len(entries))
	for _, e := range entries {
		items = append(items, &types.AttributeValueMemberM{Value: map[string]types.AttributeValue{
			e.IDKey:  &types.AttributeValueMemberS{Value: e.ID},
			e.ValKey: &types.AttributeValueMemberN{Value: fmt.Sprintf("%d", e.Value)},
		}})
	}
	return &types.AttributeValueMemberL{Value: items}
}

func stringAttr(item map[string]types.AttributeValue, key string) string {
	if s, ok := item[key].(*types.AttributeValueMemberS); ok {
		return s.Value
	}
	return ""
}

// --- I/O orchestration -----------------------------------------------------

type stats struct {
	scanned, converted, canonical, undetectable, conflicting, noSelections, parseErrors int
}

func main() {
	apply := flag.Bool("apply", false, "write the rewrites; without it the tool only reports (dry run)")
	table := flag.String("table", "submissions", "submissions table name")
	questionsTable := flag.String("questions-table", "question", "questions table name (source of option counts)")
	flag.Parse()

	if _, err := os.Stat(".env"); err == nil {
		_ = godotenv.Load()
	}
	ctx := context.Background()
	cfg, err := awsconfig.Load(ctx)
	if err != nil {
		log.Fatalf("load aws config: %v", err)
	}
	client := awsconfig.DynamoClient(cfg)

	optionCounts, err := loadOptionCounts(ctx, client, *questionsTable)
	if err != nil {
		log.Fatalf("scan %s: %v", *questionsTable, err)
	}

	items, err := scanAll(ctx, client, *table)
	if err != nil {
		log.Fatalf("scan %s: %v", *table, err)
	}

	verb := "WOULD REWRITE"
	if *apply {
		verb = "REWROTE"
	}
	var s stats
	for _, item := range items {
		s.scanned++
		entries, err := parseMissedQuestions(item)
		if err != nil {
			s.parseErrors++
			log.Printf("submission %s: unreadable missed_questions: %v", stringAttr(item, "id"), err)
			continue
		}
		res := migrateEntries(entries, optionCounts)
		switch res.Status {
		case statusConvert:
			s.converted++
			log.Printf("submission %s (contest=%s student=%s): %s %s -> %s%s",
				stringAttr(item, "id"), stringAttr(item, "contest_id"), stringAttr(item, "student_id"),
				verb, formatEntries(entries), formatEntries(res.Entries), noteSuffix(res.Notes))
			if *apply {
				if err := writeMissedQuestions(ctx, client, *table, item["id"], res.Entries); err != nil {
					log.Fatalf("update submission %s: %v", stringAttr(item, "id"), err)
				}
			}
		case statusCanonical:
			s.canonical++
		case statusUndetectable:
			s.undetectable++
			log.Printf("submission %s: values valid under BOTH conventions, left untouched: %s%s",
				stringAttr(item, "id"), formatEntries(entries), noteSuffix(res.Notes))
		case statusConflicting:
			s.conflicting++
			log.Printf("submission %s: CONFLICTING conventions in one row, needs manual review: %s",
				stringAttr(item, "id"), formatEntries(entries))
		case statusNoSelections:
			s.noSelections++
		}
	}

	mode := "DRY RUN (nothing was written; re-run with -apply)"
	if *apply {
		mode = "APPLY"
	}
	fmt.Printf("\n[%s] scanned=%d to-convert=%d already-canonical=%d undetectable=%d conflicting=%d no-selections=%d parse-errors=%d\n",
		mode, s.scanned, s.converted, s.canonical, s.undetectable, s.conflicting, s.noSelections, s.parseErrors)
	if !*apply && s.converted > 0 {
		fmt.Println("rows above WOULD be rewritten; pass -apply only after client and backend run the unified 1-based convention")
	}
}

func noteSuffix(notes []string) string {
	if len(notes) == 0 {
		return ""
	}
	return " [" + strings.Join(notes, "; ") + "]"
}

func formatEntries(entries []missedEntry) string {
	parts := make([]string, 0, len(entries))
	for _, e := range entries {
		parts = append(parts, fmt.Sprintf("%s=%d", e.ID, e.Value))
	}
	return "{" + strings.Join(parts, ", ") + "}"
}

func loadOptionCounts(ctx context.Context, client *dynamodb.Client, table string) (map[string]int, error) {
	items, err := scanAll(ctx, client, table)
	if err != nil {
		return nil, err
	}
	counts := make(map[string]int, len(items))
	for _, item := range items {
		id := stringAttr(item, "id")
		if id == "" {
			continue
		}
		if l, ok := item["multiple_choice"].(*types.AttributeValueMemberL); ok {
			counts[id] = len(l.Value)
		}
	}
	return counts, nil
}

func scanAll(ctx context.Context, client *dynamodb.Client, table string) ([]map[string]types.AttributeValue, error) {
	var out []map[string]types.AttributeValue
	var exclusive map[string]types.AttributeValue
	for {
		callCtx, cancel := awsconfig.CallCtx(ctx)
		in := &dynamodb.ScanInput{TableName: aws.String(table), ExclusiveStartKey: exclusive}
		resp, err := client.Scan(callCtx, in)
		cancel()
		if err != nil {
			return nil, err
		}
		out = append(out, resp.Items...)
		if len(resp.LastEvaluatedKey) == 0 {
			return out, nil
		}
		exclusive = resp.LastEvaluatedKey
	}
}

func writeMissedQuestions(ctx context.Context, client *dynamodb.Client, table string, key types.AttributeValue, entries []missedEntry) error {
	callCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	_, err := client.UpdateItem(callCtx, &dynamodb.UpdateItemInput{
		TableName:                 aws.String(table),
		Key:                       map[string]types.AttributeValue{"id": key},
		UpdateExpression:          aws.String("SET missed_questions = :mq"),
		ExpressionAttributeValues: map[string]types.AttributeValue{":mq": encodeMissedQuestions(entries)},
	})
	return err
}
