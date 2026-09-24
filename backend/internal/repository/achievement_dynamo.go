package repository

import (
	"context"
	"victor-contest-go/internal/awsconfig"
	"victor-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"
)

type AchievementDynamoRepository struct {
	db        *dynamodb.Client
	tableName string
}

func NewAchievementDynamoRepository(db *dynamodb.Client, table string) *AchievementDynamoRepository {
	return &AchievementDynamoRepository{db: db, tableName: table}
}

func (r *AchievementDynamoRepository) AddAchievement(achievement domain.Achievement) (string, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	if achievement.ID == "" {
		achievement.ID = uuid.New().String()
	}
	item, err := attributevalue.MarshalMap(achievement)
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
	return achievement.ID, nil
}

func (r *AchievementDynamoRepository) UpdateAchievement(id string, update domain.Achievement) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	update.ID = id
	item, err := attributevalue.MarshalMap(update)
	if err != nil {
		return err
	}
	_, err = r.db.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: &r.tableName,
		Item:      item,
	})
	return err
}

func (r *AchievementDynamoRepository) DeleteAchievement(id string) error {
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

func (r *AchievementDynamoRepository) GetAchievementByID(id string) (*domain.Achievement, error) {
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
	var achievement domain.Achievement
	err = attributevalue.UnmarshalMap(out.Item, &achievement)
	if err != nil {
		return nil, err
	}
	return &achievement, nil
}

func (r *AchievementDynamoRepository) GetAllAchievements() ([]domain.Achievement, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	out, err := r.db.Scan(ctx, &dynamodb.ScanInput{
		TableName: &r.tableName,
	})
	if err != nil {
		return nil, err
	}
	var achievements []domain.Achievement
	err = attributevalue.UnmarshalListOfMaps(out.Items, &achievements)
	if err != nil {
		return nil, err
	}
	return achievements, nil
}

func (r *AchievementDynamoRepository) GetAchievementsByStudent(studentID string) ([]domain.Achievement, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	studentVal, _ := attributevalue.Marshal(studentID)
	out, err := r.db.Scan(ctx, &dynamodb.ScanInput{
		TableName:        &r.tableName,
		FilterExpression: aws.String("student_id = :student_id"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":student_id": studentVal,
		},
	})
	if err != nil {
		return nil, err
	}
	var achievements []domain.Achievement
	err = attributevalue.UnmarshalListOfMaps(out.Items, &achievements)
	if err != nil {
		return nil, err
	}
	return achievements, nil
}
