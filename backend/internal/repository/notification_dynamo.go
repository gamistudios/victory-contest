package repository

import (
	"context"
	"fmt"
	"victory-contest-go/internal/awsconfig"
	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type NotificationDynamoRepository struct {
	db        *dynamodb.Client
	tableName string
}

func NewNotificationDynamoRepository(db *dynamodb.Client, table string) *NotificationDynamoRepository {
	return &NotificationDynamoRepository{db: db, tableName: table}
}

func (r *NotificationDynamoRepository) AddNotification(notification domain.Notification) (string, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	if notification.ID == "" {
		notification.ID = usecase.GenerateUniqueId()
	}
	item, err := attributevalue.MarshalMap(notification)
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
	return notification.ID, nil
}

func (r *NotificationDynamoRepository) UpdateNotification(id string, update domain.Notification) error {
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

func (r *NotificationDynamoRepository) DeleteNotification(id string) error {
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

func (r *NotificationDynamoRepository) GetNotificationByID(id string) (*domain.Notification, error) {
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
	var notification domain.Notification
	err = attributevalue.UnmarshalMap(out.Item, &notification)
	if err != nil {
		return nil, err
	}
	return &notification, nil
}

func (r *NotificationDynamoRepository) GetAllNotifications() ([]domain.Notification, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	// Paged Scan (issue #41).
	items, err := scanPages(ctx, r.db, &dynamodb.ScanInput{
		TableName: &r.tableName,
	})
	if err != nil {
		return nil, err
	}
	var notifications []domain.Notification
	err = attributevalue.UnmarshalListOfMaps(items, &notifications)
	if err != nil {
		return nil, err
	}
	return notifications, nil
}

func (r *NotificationDynamoRepository) GetNotificationsByRecipient(recipientID string) ([]domain.Notification, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	userQueryInput := &dynamodb.QueryInput{
		TableName:              aws.String(r.tableName),
		IndexName:              aws.String("recipient_id-index"),
		KeyConditionExpression: aws.String("recipient_id = :rid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":rid": &types.AttributeValueMemberS{Value: recipientID},
		},
	}

	// Paged Queries (issue #41): recipient partitions (especially "all")
	// grow past the 1 MB single-page limit.
	userItems, err := queryPages(ctx, r.db, userQueryInput)
	if err != nil {
		return nil, fmt.Errorf("error querying user notifications: %w", err)
	}

	allQueryInput := &dynamodb.QueryInput{
		TableName:              aws.String(r.tableName),
		IndexName:              aws.String("recipient_id-index"),
		KeyConditionExpression: aws.String("recipient_id = :allvalue"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":allvalue": &types.AttributeValueMemberS{Value: "all"},
		},
	}

	allItems, err := queryPages(ctx, r.db, allQueryInput)
	if err != nil {
		return nil, fmt.Errorf("error querying 'all' notifications: %w", err)
	}

	var notifications []domain.Notification
	if err = attributevalue.UnmarshalListOfMaps(userItems, &notifications); err != nil {
		return nil, fmt.Errorf("error unmarshalling user notifications: %w", err)
	}

	var allNotifications []domain.Notification
	if err = attributevalue.UnmarshalListOfMaps(allItems, &allNotifications); err != nil {
		return nil, fmt.Errorf("error unmarshalling 'all' notifications: %w", err)
	}

	notifications = append(notifications, allNotifications...)
	return notifications, nil
}
