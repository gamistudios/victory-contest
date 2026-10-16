package migrations

import (
	"context"
	"fmt"
	"strings"
	"time"

	"victory-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// ContestModeChange is one contest mode stamp (also the backup row).
type ContestModeChange struct {
	ID              string `json:"id"`
	Title           string `json:"title"`
	Mode            string `json:"mode"`
	DurationMinutes int    `json:"duration_minutes,omitempty"`
	PenaltyPercent  int    `json:"penalty_percent,omitempty"`
	EndTime         string `json:"end_time,omitempty"`
	Window          string `json:"window"`
}

// contestModeFor mirrors usecase.AddContest's Phase 2 defaulting exactly: a row
// that carries a per-student limit is self_paced (and gets the default late
// penalty when the admin left it at 0), everything else is the shared-window
// "global" mode the legacy engine always implied. Nothing is invented here.
func contestModeFor(c domain.Contest) (mode string, penalty int) {
	if c.DurationMinutes > 0 {
		if c.LatePenaltyPercent == 0 {
			return domain.ContestModeSelfPaced, domain.DefaultLatePenaltyPercent
		}
		return domain.ContestModeSelfPaced, 0
	}
	return domain.ContestModeGlobal, 0
}

// contestWindow classifies a stored end_time for the report only; the write does
// not depend on it. Zone-less timestamps are read as UTC, the same way
// usecase.parseContestTime reads them.
func contestWindow(endTime string, now time.Time) string {
	e := strings.TrimSpace(endTime)
	if e == "" {
		return "no end_time"
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05", "2006-01-02T15:04", "2006-01-02"} {
		if t, err := time.Parse(layout, e); err == nil {
			if now.Before(t) {
				return "closes " + t.UTC().Format(time.RFC3339)
			}
			return "ended " + t.UTC().Format(time.RFC3339)
		}
	}
	return "unparsable"
}

// MigrateContestMode stamps an explicit Phase 2 `mode` on contest rows that have
// never had one. It is the prerequisite for deleting the legacy contest pages:
// the pages and the Phase 2 engine read the same rows, and an unstamped row only
// behaves as "global" because EffectiveMode() guesses it. After this the guess is
// data, not code.
//
// Writes are conditional on `mode` still being absent, so a row an admin set in
// the meantime is left alone, and the mapping is the same one AddContest applies
// to a new contest. `late_penalty_percent` is only written for a self_paced stamp
// whose scanned value was 0. Scope, kind, times and questions are untouched.
// Dry run unless env.Apply; JSON backup of every change before the first write.
//
// NOT registered in Registry(): like MigrateContestScope it is run by hand
// (cmd/migrate-contest-mode) after a dry-run review, never on boot, so no boot
// can write to the live table without someone having read the report.
func MigrateContestMode(ctx context.Context, env Env, table string) (Result, error) {
	if table == "" {
		table = "contests"
	}
	items, err := scanAll(ctx, env.DB, table)
	if err != nil {
		return Result{}, fmt.Errorf("scan %s: %w", table, err)
	}
	now := time.Now().UTC()
	var changes []ContestModeChange
	var changeItems []map[string]types.AttributeValue
	stamped, withPenalty := 0, 0
	for _, item := range items {
		var c domain.Contest
		if err := attributevalue.UnmarshalMap(item, &c); err != nil || c.ID == "" {
			continue
		}
		if c.Mode != "" {
			stamped++
			continue
		}
		mode, penalty := contestModeFor(c)
		changes = append(changes, ContestModeChange{
			ID: c.ID, Title: c.Title, Mode: mode, DurationMinutes: c.DurationMinutes,
			PenaltyPercent: penalty, EndTime: c.EndTime, Window: contestWindow(c.EndTime, now),
		})
		changeItems = append(changeItems, item)
		if penalty > 0 {
			withPenalty++
		}
	}
	open, ended := 0, 0
	for _, ch := range changes {
		switch {
		case strings.HasPrefix(ch.Window, "closes"):
			open++
		case strings.HasPrefix(ch.Window, "ended"):
			ended++
		}
	}
	say(env, "contests=%d already-stamped=%d to-stamp=%d (window open=%d ended=%d, penalty defaulted=%d)",
		len(items), stamped, len(changes), open, ended, withPenalty)
	for _, ch := range changes {
		say(env, "  %-10s id=%s duration=%d %s %q", ch.Mode, ch.ID, ch.DurationMinutes, ch.Window, ch.Title)
	}
	if len(changes) > 0 && env.Apply {
		path, err := writeBackup(env, "migrate-contest-mode", changes)
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
	done, skipped, failed := 0, 0, 0
	for i, ch := range changes {
		if !env.Apply {
			continue
		}
		key, err := fullKey(pKey, changeItems[i])
		if err != nil {
			failed++
			say(env, "update %s failed: %v", ch.ID, err)
			continue
		}
		expr := "SET #m = :m"
		vals := map[string]types.AttributeValue{":m": strAttr(ch.Mode)}
		names := map[string]string{"#m": "mode"}
		if ch.PenaltyPercent > 0 {
			expr += ", #p = :p"
			vals[":p"] = &types.AttributeValueMemberN{Value: fmt.Sprint(ch.PenaltyPercent)}
			names["#p"] = "late_penalty_percent"
		}
		_, err = env.DB.UpdateItem(ctx, &dynamodb.UpdateItemInput{
			TableName:                 aws.String(table),
			Key:                       key,
			UpdateExpression:          aws.String(expr),
			ConditionExpression:       aws.String("attribute_exists(id) AND attribute_not_exists(#m)"),
			ExpressionAttributeNames:  names,
			ExpressionAttributeValues: vals,
		})
		if err != nil {
			var cf *types.ConditionalCheckFailedException
			if asCondFail(err, &cf) {
				skipped++
				continue
			}
			failed++
			say(env, "update %s failed: %v", ch.ID, err)
			continue
		}
		done++
	}
	sum := fmt.Sprintf("contests=%d to-stamp=%d stamped=%d skipped(already-written-by-someone-else)=%d failed=%d",
		len(items), len(changes), done, skipped, failed)
	if failed > 0 {
		return Result{Summary: sum}, fmt.Errorf("%d contest updates failed", failed)
	}
	return Result{Summary: sum}, nil
}
