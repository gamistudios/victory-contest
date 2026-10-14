package migrations

import (
	"context"
	"fmt"
	"sort"

	"victory-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// GradeChange is one student grade rewrite (also the backup row).
type GradeChange struct {
	ID       string `json:"id"`
	OldGrade string `json:"old_grade"`
	NewGrade string `json:"new_grade"`
}

// MigrateGrade rewrites legacy "1".."4" student grades to "9".."12" (plan D1).
// Valid and unrecognised values are never touched. Idempotent; each write is
// conditional on the old value. With env.Apply=false it only reports.
func MigrateGrade(ctx context.Context, env Env, table string) (Result, error) {
	if table == "" {
		table = "student"
	}
	items, err := scanAll(ctx, env.DB, table)
	if err != nil {
		return Result{}, fmt.Errorf("scan %s: %w", table, err)
	}
	distinct := map[string]int{}
	var changes []GradeChange
	var changeItems []map[string]types.AttributeValue // parallel to changes: source of each row's full key
	unknown := 0
	for _, item := range items {
		var st struct {
			ID    string `dynamodbav:"id"`
			Grade string `dynamodbav:"grade"`
		}
		if err := attributevalue.UnmarshalMap(item, &st); err != nil || st.ID == "" {
			continue
		}
		distinct[st.Grade]++
		if domain.IsValidGrade(st.Grade) {
			continue
		}
		if next, ok := domain.LegacyGradeToCurrent(st.Grade); ok {
			changes = append(changes, GradeChange{ID: st.ID, OldGrade: st.Grade, NewGrade: next})
			changeItems = append(changeItems, item)
		} else {
			unknown++
			say(env, "UNMAPPED id=%s grade=%q (left untouched)", st.ID, st.Grade)
		}
	}
	keys := make([]string, 0, len(distinct))
	for k := range distinct {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		say(env, "grade %-8q %d", k, distinct[k])
	}
	if len(changes) > 0 && env.Apply {
		path, err := writeBackup(env, "migrate-grade", changes)
		if err != nil {
			return Result{}, fmt.Errorf("backup: %w", err)
		}
		say(env, "backup of %d rows: %s", len(changes), path)
	}
	done, failed := 0, 0
	var pKey []string
	if env.Apply {
		var err error
		pKey, err = keyNames(ctx, env.DB, table)
		if err != nil {
			return Result{}, err
		}
	}
	for i, ch := range changes {
		if !env.Apply {
			say(env, "WOULD CHANGE id=%s %q -> %q", ch.ID, ch.OldGrade, ch.NewGrade)
			continue
		}
		key, err := fullKey(pKey, changeItems[i])
		if err != nil {
			failed++
			say(env, "update %s failed: %v", ch.ID, err)
			continue
		}
		_, err = env.DB.UpdateItem(ctx, &dynamodb.UpdateItemInput{
			TableName:           aws.String(table),
			Key:                 key,
			UpdateExpression:    aws.String("SET grade = :n"),
			ConditionExpression: aws.String("attribute_exists(id) AND grade = :o"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":n": strAttr(ch.NewGrade), ":o": strAttr(ch.OldGrade),
			},
		})
		if err != nil {
			var cf *types.ConditionalCheckFailedException
			if asCondFail(err, &cf) {
				continue // changed concurrently (already migrated): fine
			}
			failed++
			say(env, "update %s failed: %v", ch.ID, err)
			continue
		}
		done++
	}
	sum := fmt.Sprintf("scanned=%d to-change=%d changed=%d unmapped=%d failed=%d", len(items), len(changes), done, unknown, failed)
	if failed > 0 {
		return Result{Summary: sum}, fmt.Errorf("%d grade updates failed", failed)
	}
	return Result{Summary: sum}, nil
}
