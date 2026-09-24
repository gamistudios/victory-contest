package repository

import (
	"context"
	"errors"
	"victor-contest-go/internal/awsconfig"
	"victor-contest-go/internal/domain"
	usecase "victor-contest-go/internal/usecase"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"
)

type SubmissionDynamoRepository struct {
	db        *dynamodb.Client
	tableName string
}

func NewSubmissionDynamoRepository(db *dynamodb.Client, table string) *SubmissionDynamoRepository {
	return &SubmissionDynamoRepository{db: db, tableName: table}
}

func (r *SubmissionDynamoRepository) AddSubmission(submission domain.Submission) (string, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	if submission.ID == "" {
		submission.ID = uuid.New().String()
	}
	item, err := attributevalue.MarshalMap(submission)
	if err != nil {
		return "", err
	}
	_, err = r.db.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: &r.tableName,
		Item:      item,
	})
	if err != nil {
		return "", err
	}
	return submission.ID, nil
}

func (r *SubmissionDynamoRepository) GetSubmissionByID(id string) (*domain.Submission, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	key, err := attributevalue.MarshalMap(map[string]string{
		"id": id,
	})
	if err != nil {
		return nil, err
	}
	out, err := r.db.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: &r.tableName,
		Key:       key,
	})
	if err != nil {
		return nil, err
	}

	if out.Item == nil {
		return nil, nil
	}
	var submission domain.Submission
	err = attributevalue.UnmarshalMap(out.Item, &submission)
	if err != nil {
		return nil, err
	}
	return &submission, nil
}

func (r *SubmissionDynamoRepository) GetAllSubmissions() ([]domain.Submission, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	// Paged Scan (issue #41): feeds leaderboard/statistics aggregation, so
	// it must see every row, not just the first 1 MB page.
	items, err := scanPages(ctx, r.db, &dynamodb.ScanInput{
		TableName: &r.tableName,
	})
	if err != nil {
		return nil, err
	}
	var submissions []domain.Submission
	err = attributevalue.UnmarshalListOfMaps(items, &submissions)
	if err != nil {
		return nil, err
	}
	return submissions, nil
}

func (r *SubmissionDynamoRepository) GetSubmissionsByContest(contestID string) ([]domain.Submission, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	contestIDVal, err := attributevalue.Marshal(contestID)
	if err != nil {
		return nil, err // It's good practice to handle this marshal error
	}

	// Paged Query (issue #41): a popular contest's submission partition can
	// exceed one 1 MB page.
	items, err := queryPages(ctx, r.db, &dynamodb.QueryInput{
		TableName:              &r.tableName,
		IndexName:              aws.String("contest_id-index"),
		KeyConditionExpression: aws.String("contest_id = :contest_id"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":contest_id": contestIDVal,
		},
	})

	if err != nil {
		return nil, err
	}

	var submissions []domain.Submission
	err = attributevalue.UnmarshalListOfMaps(items, &submissions)
	if err != nil {
		return nil, err
	}

	return submissions, nil
}

func (r *SubmissionDynamoRepository) GetSubmissionsByStudent(studentID string) ([]domain.Submission, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	studentIDVal, err := attributevalue.Marshal(studentID)
	if err != nil {
		return nil, err
	}

	// Paged Query (issue #41).
	items, err := queryPages(ctx, r.db, &dynamodb.QueryInput{
		TableName:              aws.String(r.tableName),
		IndexName:              aws.String("student_id-index"),
		KeyConditionExpression: aws.String("student_id = :sid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":sid": studentIDVal,
		},
	})
	if err != nil {
		return nil, err
	}

	var submissions []domain.Submission
	err = attributevalue.UnmarshalListOfMaps(items, &submissions)
	if err != nil {
		return nil, err
	}

	return submissions, nil
}
func (r *SubmissionDynamoRepository) GetSubmissionsByStudentAndContest(conId, studentID string) (*domain.Submission, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	studentIDVal, err := attributevalue.Marshal(studentID)
	if err != nil {
		return nil, err
	}
	contestIDVal, err := attributevalue.Marshal(conId)
	if err != nil {
		return nil, err
	}

	// Paged Query (issue #41): the "newest submission" pick below is only
	// correct over the full result set, not a single page.
	items, err := queryPages(ctx, r.db, &dynamodb.QueryInput{
		TableName:              aws.String(r.tableName),
		IndexName:              aws.String("contest_id-student_id-index"),
		KeyConditionExpression: aws.String("contest_id = :cId AND student_id = :sid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":sid": studentIDVal,
			":cId": contestIDVal,
		},
	})
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, nil
	}

	// The GSI is keyed (contest_id, student_id) with no time sort, so a
	// student who submitted N times has N items in arbitrary order. The
	// editorial must reflect their LATEST attempt, not whichever row the
	// index happens to return first.
	var submissions []domain.Submission
	if err := attributevalue.UnmarshalListOfMaps(items, &submissions); err != nil {
		return nil, err
	}
	newest := submissions[0]
	for _, s := range submissions[1:] {
		if !s.SubmissionTime.Before(newest.SubmissionTime) {
			newest = s
		}
	}

	return &newest, nil
}

// DeleteSubmission removes a submission row by primary key. The conditional
// write (attribute_exists(id)) makes the delete atomic w.r.t. existence: a
// missing row surfaces as usecase.ErrSubmissionNotFound so the handler can
// answer 404 without a separate Get round-trip (GetSubmissionByID returns
// nil, nil for missing rows, so a pre-check would double-read).
func (r *SubmissionDynamoRepository) DeleteSubmission(id string) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	key, err := attributevalue.MarshalMap(map[string]string{"id": id})
	if err != nil {
		return err
	}
	_, err = r.db.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName:                aws.String(r.tableName),
		Key:                      key,
		ConditionExpression:      aws.String("attribute_exists(#id)"),
		ExpressionAttributeNames: map[string]string{"#id": "id"},
	})
	if err != nil {
		var ccf *types.ConditionalCheckFailedException
		if errors.As(err, &ccf) {
			return usecase.ErrSubmissionNotFound
		}
		return err
	}
	return nil
}
