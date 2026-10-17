package repository

import (
	"context"

	"victory-contest-go/internal/awsconfig"
	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// habitRepo stores habit_plans and habit_logs on the shared docStore helper.
type habitRepo struct {
	plans docStore[domain.HabitPlan]
	logs  docStore[domain.HabitLog]
}

func NewHabitDynamoRepository(db *dynamodb.Client, plansTable, logsTable string) usecase.HabitRepository {
	return &habitRepo{
		plans: docStore[domain.HabitPlan]{db, plansTable},
		logs:  docStore[domain.HabitLog]{db, logsTable},
	}
}

// queryIndexS lists every item whose string index key equals value.
func queryIndexS[T any](s docStore[T], index, attr, value string) ([]T, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	items, err := queryPages(ctx, s.db, &dynamodb.QueryInput{
		TableName:                 aws.String(s.table),
		IndexName:                 aws.String(index),
		KeyConditionExpression:    aws.String("#k = :v"),
		ExpressionAttributeNames:  map[string]string{"#k": attr},
		ExpressionAttributeValues: map[string]types.AttributeValue{":v": &types.AttributeValueMemberS{Value: value}},
	})
	if err != nil {
		return nil, err
	}
	var out []T
	return out, attributevalue.UnmarshalListOfMaps(items, &out)
}

func (r *habitRepo) GetPlan(id string) (*domain.HabitPlan, error) { return r.plans.get(id) }
func (r *habitRepo) PutPlan(p domain.HabitPlan) error             { return r.plans.put(p) }
func (r *habitRepo) DeletePlan(id string) error                   { return r.plans.del(id) }
func (r *habitRepo) ListAllPlans() ([]domain.HabitPlan, error)    { return r.plans.scan() }

func (r *habitRepo) ListPlansByProgram(programID string) ([]domain.HabitPlan, error) {
	return queryIndexS(r.plans, "program_id-index", "program_id", programID)
}

func (r *habitRepo) GetLog(id string) (*domain.HabitLog, error) { return r.logs.get(id) }
func (r *habitRepo) PutLog(l domain.HabitLog) error             { return r.logs.put(l) }
func (r *habitRepo) ListAllLogs() ([]domain.HabitLog, error)    { return r.logs.scan() }

func (r *habitRepo) ListLogsByStudent(studentID string) ([]domain.HabitLog, error) {
	return queryIndexS(r.logs, "student_id-index", "student_id", studentID)
}

func (r *habitRepo) ListLogsByPlan(planID string) ([]domain.HabitLog, error) {
	return queryIndexS(r.logs, "plan_id-index", "plan_id", planID)
}
