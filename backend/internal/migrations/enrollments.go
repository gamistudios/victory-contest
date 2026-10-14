package migrations

import (
	"context"
	"fmt"
	"time"

	"victory-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// EnrollmentChange is one student's new enrollment (also the backup row).
type EnrollmentChange struct {
	ID          string              `json:"id"`
	Grade       string              `json:"grade"`
	Primary     string              `json:"primary_program_id"`
	Enrollments []domain.Enrollment `json:"enrollments"`
}

// MigrateEnrollments gives students with no enrollment the program
// "grade-<n>" (grades 11/12 default to the natural stream, 9/10 to common),
// unconfirmed so the student can still correct the stream. Students without a
// valid grade are only reported. Idempotent: the write requires that the
// student still has no `enrollments` attribute.
// Needs the grade-9..12 programs: it must run after SeedProgramsV2 and after
// the grade migration (both are guaranteed by boot order and id order).
func MigrateEnrollments(ctx context.Context, env Env, table string) (Result, error) {
	if table == "" {
		table = "student"
	}
	items, err := scanAll(ctx, env.DB, table)
	if err != nil {
		return Result{}, fmt.Errorf("scan %s: %w", table, err)
	}
	var students []domain.Student
	if err := attributevalue.UnmarshalListOfMaps(items, &students); err != nil {
		return Result{}, err
	}
	var changes []EnrollmentChange
	skipped, unknown := 0, 0
	now := time.Now().UTC().Format(time.RFC3339)
	for _, s := range students {
		if len(s.Enrollments) > 0 {
			skipped++
			continue
		}
		if !domain.IsValidGrade(s.Grade) {
			unknown++
			say(env, "skip %s: grade %q", s.ID, s.Grade)
			continue
		}
		stream := domain.StreamCommon
		if s.Grade == "11" || s.Grade == "12" {
			stream = "natural"
		}
		pid := "grade-" + s.Grade
		changes = append(changes, EnrollmentChange{ID: s.ID, Grade: s.Grade, Primary: pid,
			Enrollments: []domain.Enrollment{{ProgramID: pid, StreamID: stream, EnrolledAt: now, Source: "admin", Confirmed: false}}})
	}
	say(env, "to migrate: %d, already enrolled: %d, unknown grade: %d", len(changes), skipped, unknown)
	if !env.Apply || len(changes) == 0 {
		return Result{Summary: fmt.Sprintf("to-migrate=%d already=%d unknown=%d (nothing written)", len(changes), skipped, unknown)}, nil
	}
	path, err := writeBackup(env, "migrate-enrollments", changes)
	if err != nil {
		return Result{}, fmt.Errorf("backup: %w", err)
	}
	say(env, "backup: %s", path)
	done, failed := 0, 0
	for _, c := range changes {
		en, err := attributevalue.Marshal(c.Enrollments)
		if err != nil {
			failed++
			continue
		}
		_, err = env.DB.UpdateItem(ctx, &dynamodb.UpdateItemInput{
			TableName:                 aws.String(table),
			Key:                       map[string]types.AttributeValue{"id": strAttr(c.ID)},
			UpdateExpression:          aws.String("SET enrollments = :e, primary_program_id = :p"),
			ConditionExpression:       aws.String("attribute_exists(id) AND attribute_not_exists(enrollments)"),
			ExpressionAttributeValues: map[string]types.AttributeValue{":e": en, ":p": strAttr(c.Primary)},
		})
		if err != nil {
			var cf *types.ConditionalCheckFailedException
			if asCondFail(err, &cf) {
				continue // enrolled in the meantime
			}
			failed++
			say(env, "fail %s: %v", c.ID, err)
			continue
		}
		done++
	}
	sum := fmt.Sprintf("migrated=%d already=%d unknown=%d failed=%d", done, skipped, unknown, failed)
	if failed > 0 {
		return Result{Summary: sum}, fmt.Errorf("%d enrollment writes failed", failed)
	}
	return Result{Summary: sum}, nil
}
