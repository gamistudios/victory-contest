package repository

import (
	"context"
	"fmt"
	"time"
	"victor-contest-go/internal/awsconfig"
	"victor-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"
)

type FeedbackQuestionDynamoRepository struct {
	db        *dynamodb.Client
	tableName string
}

func NewFeedbackQuestionDynamoRepository(db *dynamodb.Client, table string) *FeedbackQuestionDynamoRepository {
	return &FeedbackQuestionDynamoRepository{db: db, tableName: table}
}

func (r *FeedbackQuestionDynamoRepository) AddFeedbackQuestion(question domain.FeedbackQuestion) (string, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	if question.ID == "" {
		question.ID = uuid.New().String()
	}
	item, err := attributevalue.MarshalMap(question)
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
	return question.ID, nil
}

func (r *FeedbackQuestionDynamoRepository) UpdateFeedbackQuestion(id string, update domain.FeedbackQuestion) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	// First, get the existing question to preserve the ID and timestamps
	existingQuestion, err := r.GetFeedbackQuestionByID(id)
	if err != nil {
		return err
	}
	if existingQuestion == nil {
		return fmt.Errorf("question not found")
	}

	// Update the fields with the new data
	existingQuestion.Question = update.Question
	existingQuestion.Options = update.Options
	existingQuestion.AdminID = update.AdminID
	existingQuestion.IsActive = update.IsActive
	existingQuestion.UpdatedAt = time.Now()

	// Save the updated question
	item, err := attributevalue.MarshalMap(existingQuestion)
	if err != nil {
		return err
	}
	_, err = r.db.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: &r.tableName,
		Item:      item,
	})
	return err
}

func (r *FeedbackQuestionDynamoRepository) DeleteFeedbackQuestion(id string) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	key, err := attributevalue.MarshalMap(map[string]string{"id": id})
	if err != nil {
		return err
	}
	_, err = r.db.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: &r.tableName,
		Key:       key,
	})
	return err
}

func (r *FeedbackQuestionDynamoRepository) GetFeedbackQuestionByID(id string) (*domain.FeedbackQuestion, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	key, err := attributevalue.MarshalMap(map[string]string{"id": id})
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
	var question domain.FeedbackQuestion
	err = attributevalue.UnmarshalMap(out.Item, &question)
	if err != nil {
		return nil, err
	}
	return &question, nil
}

func (r *FeedbackQuestionDynamoRepository) GetAllFeedbackQuestions() ([]domain.FeedbackQuestion, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	out, err := r.db.Scan(ctx, &dynamodb.ScanInput{
		TableName: &r.tableName,
	})
	if err != nil {
		return nil, err
	}
	var questions []domain.FeedbackQuestion
	err = attributevalue.UnmarshalListOfMaps(out.Items, &questions)
	if err != nil {
		return nil, err
	}
	return questions, nil
}

func (r *FeedbackQuestionDynamoRepository) GetActiveFeedbackQuestions() ([]domain.FeedbackQuestion, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	isActiveVal, _ := attributevalue.Marshal(true)
	out, err := r.db.Scan(ctx, &dynamodb.ScanInput{
		TableName:        &r.tableName,
		FilterExpression: aws.String("is_active = :is_active"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":is_active": isActiveVal,
		},
	})
	if err != nil {
		return nil, err
	}
	var questions []domain.FeedbackQuestion
	err = attributevalue.UnmarshalListOfMaps(out.Items, &questions)
	if err != nil {
		return nil, err
	}
	return questions, nil
}

func (r *FeedbackQuestionDynamoRepository) GetFeedbackQuestionsByAdmin(adminID string) ([]domain.FeedbackQuestion, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	adminIDVal, _ := attributevalue.Marshal(adminID)
	out, err := r.db.Scan(ctx, &dynamodb.ScanInput{
		TableName:        &r.tableName,
		FilterExpression: aws.String("admin_id = :admin_id"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":admin_id": adminIDVal,
		},
	})
	if err != nil {
		return nil, err
	}
	var questions []domain.FeedbackQuestion
	err = attributevalue.UnmarshalListOfMaps(out.Items, &questions)
	if err != nil {
		return nil, err
	}
	return questions, nil
}
