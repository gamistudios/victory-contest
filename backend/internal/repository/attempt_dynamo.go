package repository

import (
	"context"
	"errors"
	"fmt"

	"victory-contest-go/internal/awsconfig"
	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// AttemptDynamoRepository stores the attempts table (plan §5.4.2).
type AttemptDynamoRepository struct {
	db    *dynamodb.Client
	table string
}

func NewAttemptDynamoRepository(db *dynamodb.Client, table string) *AttemptDynamoRepository {
	return &AttemptDynamoRepository{db: db, table: table}
}

func idKey(id string) map[string]types.AttributeValue {
	return map[string]types.AttributeValue{"id": &types.AttributeValueMemberS{Value: id}}
}

// Create is a conditional put on the deterministic id: the first attempt is
// the only recorded one, race-free. Returns usecase.ErrAlreadyAttempted if it exists.
func (r *AttemptDynamoRepository) Create(a domain.Attempt) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	item, err := attributevalue.MarshalMap(a)
	if err != nil {
		return err
	}
	_, err = r.db.PutItem(ctx, &dynamodb.PutItemInput{
		TableName:           aws.String(r.table),
		Item:                item,
		ConditionExpression: aws.String("attribute_not_exists(id)"),
	})
	var cf *types.ConditionalCheckFailedException
	if errors.As(err, &cf) {
		return usecase.ErrAlreadyAttempted
	}
	return err
}

func (r *AttemptDynamoRepository) Get(id string) (*domain.Attempt, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	out, err := r.db.GetItem(ctx, &dynamodb.GetItemInput{TableName: aws.String(r.table), Key: idKey(id)})
	if err != nil {
		return nil, err
	}
	if len(out.Item) == 0 {
		return nil, nil
	}
	var a domain.Attempt
	if err := attributevalue.UnmarshalMap(out.Item, &a); err != nil {
		return nil, err
	}
	return &a, nil
}

// UpdateAnswers autosaves with an optimistic version check; only while in_progress.
func (r *AttemptDynamoRepository) UpdateAnswers(id string, answers map[string]int, flagged []string, expectedVersion int) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	av, err := attributevalue.Marshal(answers)
	if err != nil {
		return err
	}
	fl, err := attributevalue.Marshal(flagged)
	if err != nil {
		return err
	}
	_, err = r.db.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                aws.String(r.table),
		Key:                      idKey(id),
		UpdateExpression:         aws.String("SET answers = :a, flagged = :f, answers_version = :nv"),
		ConditionExpression:      aws.String("#s = :ip AND answers_version = :v"),
		ExpressionAttributeNames: map[string]string{"#s": "status"},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":a": av, ":f": fl,
			":ip": &types.AttributeValueMemberS{Value: domain.AttemptInProgress},
			":v":  &types.AttributeValueMemberN{Value: fmt.Sprint(expectedVersion)},
			":nv": &types.AttributeValueMemberN{Value: fmt.Sprint(expectedVersion + 1)},
		},
	})
	var cf *types.ConditionalCheckFailedException
	if errors.As(err, &cf) {
		return usecase.ErrVersionConflict
	}
	return err
}

// Finalise writes the finished attempt, conditional on status=in_progress so
// two instances (submit vs sweeper) cannot double-finalise. Returns
// usecase.ErrAttemptFinalised if someone else already did.
func (r *AttemptDynamoRepository) Finalise(a domain.Attempt) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	item, err := attributevalue.MarshalMap(a)
	if err != nil {
		return err
	}
	_, err = r.db.PutItem(ctx, &dynamodb.PutItemInput{
		TableName:                aws.String(r.table),
		Item:                     item,
		ConditionExpression:      aws.String("#s = :ip"),
		ExpressionAttributeNames: map[string]string{"#s": "status"},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":ip": &types.AttributeValueMemberS{Value: domain.AttemptInProgress},
		},
	})
	var cf *types.ConditionalCheckFailedException
	if errors.As(err, &cf) {
		return usecase.ErrAttemptFinalised
	}
	return err
}

// Put overwrites an attempt (admin actions: exclude, waive_penalty, regrade).
func (r *AttemptDynamoRepository) Put(a domain.Attempt) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	item, err := attributevalue.MarshalMap(a)
	if err != nil {
		return err
	}
	_, err = r.db.PutItem(ctx, &dynamodb.PutItemInput{TableName: aws.String(r.table), Item: item})
	return err
}

func (r *AttemptDynamoRepository) Delete(id string) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	_, err := r.db.DeleteItem(ctx, &dynamodb.DeleteItemInput{TableName: aws.String(r.table), Key: idKey(id)})
	return err
}

func (r *AttemptDynamoRepository) queryIndex(index, attr, val string, extra *string, extraVals map[string]types.AttributeValue) ([]domain.Attempt, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	vals := map[string]types.AttributeValue{":p": &types.AttributeValueMemberS{Value: val}}
	for k, v := range extraVals {
		vals[k] = v
	}
	cond := "#p = :p"
	if extra != nil {
		cond += " AND " + *extra
	}
	var out []domain.Attempt
	var start map[string]types.AttributeValue
	for {
		res, err := r.db.Query(ctx, &dynamodb.QueryInput{
			TableName:                 aws.String(r.table),
			IndexName:                 aws.String(index),
			KeyConditionExpression:    aws.String(cond),
			ExpressionAttributeNames:  map[string]string{"#p": attr},
			ExpressionAttributeValues: vals,
			ExclusiveStartKey:         start,
		})
		if err != nil {
			return nil, err
		}
		var page []domain.Attempt
		if err := attributevalue.UnmarshalListOfMaps(res.Items, &page); err != nil {
			return nil, err
		}
		out = append(out, page...)
		if len(res.LastEvaluatedKey) == 0 {
			return out, nil
		}
		start = res.LastEvaluatedKey
	}
}

func (r *AttemptDynamoRepository) ListByStudent(studentID string) ([]domain.Attempt, error) {
	return r.queryIndex("student_id-index", "student_id", studentID, nil, nil)
}

func (r *AttemptDynamoRepository) ListByContest(contestID string) ([]domain.Attempt, error) {
	return r.queryIndex("contest_id-index", "contest_id", contestID, nil, nil)
}

// ListExpired returns in_progress attempts whose expires_at is before cutoff (RFC3339 UTC).
func (r *AttemptDynamoRepository) ListExpired(cutoff string) ([]domain.Attempt, error) {
	cond := "expires_at < :c"
	return r.queryIndex("status-expires_at-index", "status", domain.AttemptInProgress, &cond,
		map[string]types.AttributeValue{":c": &types.AttributeValueMemberS{Value: cutoff}})
}

// CountsByContest scans the attempts table (projecting only contest_id) and
// counts rows per contest. Admin-only; the table holds one row per student per contest.
func (r *AttemptDynamoRepository) CountsByContest() (map[string]int, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	out := map[string]int{}
	var start map[string]types.AttributeValue
	for {
		res, err := r.db.Scan(ctx, &dynamodb.ScanInput{
			TableName:            aws.String(r.table),
			ProjectionExpression: aws.String("contest_id"),
			ExclusiveStartKey:    start,
		})
		if err != nil {
			return nil, err
		}
		for _, it := range res.Items {
			if v, ok := it["contest_id"].(*types.AttributeValueMemberS); ok {
				out[v.Value]++
			}
		}
		if len(res.LastEvaluatedKey) == 0 {
			return out, nil
		}
		start = res.LastEvaluatedKey
	}
}

// ListFinalisedBetween scans the attempts table for finalised attempts whose
// submitted_at lies in [from, to] (RFC3339 UTC; an empty bound is open).
// Admin analytics only. The range is a FilterExpression: it trims what leaves
// DynamoDB, not what is read, which is acceptable for an admin-cached report.
func (r *AttemptDynamoRepository) ListFinalisedBetween(from, to string) ([]domain.Attempt, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	filter := "#st <> :ip AND attribute_exists(submitted_at)"
	vals := map[string]types.AttributeValue{":ip": &types.AttributeValueMemberS{Value: domain.AttemptInProgress}}
	if from != "" {
		filter += " AND submitted_at >= :from"
		vals[":from"] = &types.AttributeValueMemberS{Value: from}
	}
	if to != "" {
		filter += " AND submitted_at <= :to"
		vals[":to"] = &types.AttributeValueMemberS{Value: to}
	}
	var out []domain.Attempt
	var start map[string]types.AttributeValue
	for {
		res, err := r.db.Scan(ctx, &dynamodb.ScanInput{
			TableName:                 aws.String(r.table),
			FilterExpression:          aws.String(filter),
			ExpressionAttributeNames:  map[string]string{"#st": "status"},
			ExpressionAttributeValues: vals,
			ExclusiveStartKey:         start,
		})
		if err != nil {
			return nil, err
		}
		var page []domain.Attempt
		if err := attributevalue.UnmarshalListOfMaps(res.Items, &page); err != nil {
			return nil, err
		}
		out = append(out, page...)
		if len(res.LastEvaluatedKey) == 0 {
			return out, nil
		}
		start = res.LastEvaluatedKey
	}
}
