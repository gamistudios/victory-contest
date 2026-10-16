package migrations

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"victory-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// ContestScopeChange is one contest rewrite (also the backup row).
type ContestScopeChange struct {
	ID        string `json:"id"`
	Grade     string `json:"grade"`
	ProgramID string `json:"program_id"`
	SetKind   bool   `json:"set_kind"`
}

var gradeDigits = regexp.MustCompile(`\b(9|10|11|12)\b`)

// contestProgramFromGrade maps the legacy free-text grade ("12", "Grade 12")
// to a program id (plan 10.2). Anything else is NOT guessed.
func contestProgramFromGrade(grade string) (string, bool) {
	g := strings.TrimSpace(grade)
	if domain.IsValidGrade(g) {
		return "grade-" + g, true
	}
	if m := gradeDigits.FindString(g); m != "" {
		return "grade-" + m, true
	}
	return "", false
}

// MigrateContestScope (plan 10.2, contests): for contests with no Scope, set
// scope{program_id: grade-<n>, stream_id: common} and kind=contest. `mode` is
// NEVER touched (empty = legacy global), `type`, StartTime and EndTime are
// untouched. Contests with a scope, or an unmappable grade, are left alone.
// Idempotent; every write is conditional on scope still being absent, and the
// complete table key is lifted off the scanned item. Dry run unless env.Apply.
//
// NOT registered in Registry(): it is run by hand (cmd/migrate-contest-scope)
// after a dry-run review, not on boot.
func MigrateContestScope(ctx context.Context, env Env, table string) (Result, error) {
	if table == "" {
		table = "contests"
	}
	items, err := scanAll(ctx, env.DB, table)
	if err != nil {
		return Result{}, fmt.Errorf("scan %s: %w", table, err)
	}
	var changes []ContestScopeChange
	var changeItems []map[string]types.AttributeValue
	already, unmapped := 0, 0
	for _, item := range items {
		var c domain.Contest
		if err := attributevalue.UnmarshalMap(item, &c); err != nil || c.ID == "" {
			continue
		}
		if c.Scope != nil {
			already++
			continue
		}
		prog, ok := contestProgramFromGrade(c.Grade)
		if !ok {
			unmapped++
			say(env, "UNMAPPED contest=%s grade=%q (left untouched)", c.ID, c.Grade)
			continue
		}
		changes = append(changes, ContestScopeChange{ID: c.ID, Grade: c.Grade, ProgramID: prog, SetKind: c.Kind == ""})
		changeItems = append(changeItems, item)
	}
	say(env, "contests=%d already-scoped=%d to-change=%d unmapped=%d", len(items), already, len(changes), unmapped)
	if len(changes) > 0 && env.Apply {
		path, err := writeBackup(env, "migrate-contest-scope", changes)
		if err != nil {
			return Result{}, fmt.Errorf("backup: %w", err)
		}
		say(env, "backup of %d rows: %s", len(changes), path)
	}
	var pKey []string
	if env.Apply && len(changes) > 0 {
		if pKey, err = keyNames(ctx, env.DB, table); err != nil {
			return Result{}, err
		}
	}
	done, failed := 0, 0
	for i, ch := range changes {
		if !env.Apply {
			say(env, "WOULD SET contest=%s grade=%q -> scope %s/common kind=%v", ch.ID, ch.Grade, ch.ProgramID, ch.SetKind)
			continue
		}
		key, err := fullKey(pKey, changeItems[i])
		if err != nil {
			failed++
			say(env, "update %s failed: %v", ch.ID, err)
			continue
		}
		scope, err := attributevalue.Marshal(domain.Scope{ProgramID: ch.ProgramID, StreamID: "common"})
		if err != nil {
			failed++
			continue
		}
		expr := "SET #s = :s"
		vals := map[string]types.AttributeValue{":s": scope}
		names := map[string]string{"#s": "scope"}
		if ch.SetKind {
			expr += ", #k = :k"
			vals[":k"] = strAttr(domain.ContestKindContest)
			names["#k"] = "kind"
		}
		_, err = env.DB.UpdateItem(ctx, &dynamodb.UpdateItemInput{
			TableName:                 aws.String(table),
			Key:                       key,
			UpdateExpression:          aws.String(expr),
			ConditionExpression:       aws.String("attribute_exists(id) AND attribute_not_exists(#s)"),
			ExpressionAttributeNames:  names,
			ExpressionAttributeValues: vals,
		})
		if err != nil {
			var cf *types.ConditionalCheckFailedException
			if asCondFail(err, &cf) {
				continue
			}
			failed++
			say(env, "update %s failed: %v", ch.ID, err)
			continue
		}
		done++
	}
	sum := fmt.Sprintf("contests=%d to-change=%d changed=%d unmapped=%d failed=%d", len(items), len(changes), done, unmapped, failed)
	if failed > 0 {
		return Result{Summary: sum}, fmt.Errorf("%d contest updates failed", failed)
	}
	return Result{Summary: sum}, nil
}
