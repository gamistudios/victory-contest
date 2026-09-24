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

type PollOptionDynamoRepository struct {
	db        *dynamodb.Client
	tableName string
}

func NewPollOptionDynamoRepository(db *dynamodb.Client, table string) *PollOptionDynamoRepository {
	return &PollOptionDynamoRepository{db: db, tableName: table}
}

func (r *PollOptionDynamoRepository) AddPollOption(option domain.PollOption) (string, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	if option.ID == "" {
		option.ID = uuid.New().String()
	}
	item, err := attributevalue.MarshalMap(option)
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
	return option.ID, nil
}

func (r *PollOptionDynamoRepository) UpdatePollOption(id string, update domain.PollOption) error {
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

func (r *PollOptionDynamoRepository) DeletePollOption(id string) error {
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

func (r *PollOptionDynamoRepository) GetPollOptionByID(id string) (*domain.PollOption, error) {
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
	var option domain.PollOption
	err = attributevalue.UnmarshalMap(out.Item, &option)
	if err != nil {
		return nil, err
	}
	return &option, nil
}

func (r *PollOptionDynamoRepository) GetAllPollOptions() ([]domain.PollOption, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	out, err := r.db.Scan(ctx, &dynamodb.ScanInput{
		TableName: &r.tableName,
	})
	if err != nil {
		return nil, err
	}
	var options []domain.PollOption
	err = attributevalue.UnmarshalListOfMaps(out.Items, &options)
	if err != nil {
		return nil, err
	}
	return options, nil
}

func (r *PollOptionDynamoRepository) GetPollOptionByScore(score int) (*domain.PollOption, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	scoreVal, _ := attributevalue.Marshal(score)
	out, err := r.db.Scan(ctx, &dynamodb.ScanInput{
		TableName:        &r.tableName,
		FilterExpression: aws.String("min_score <= :score AND max_score >= :score"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":score": scoreVal,
		},
	})
	if err != nil {
		return nil, err
	}
	if len(out.Items) == 0 {
		return nil, nil
	}
	var option domain.PollOption
	err = attributevalue.UnmarshalMap(out.Items[0], &option)
	if err != nil {
		return nil, err
	}
	return &option, nil
}
