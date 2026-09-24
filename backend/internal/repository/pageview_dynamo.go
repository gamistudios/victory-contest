package repository

import (
	"context"
	"time"
	"victory-contest-go/internal/awsconfig"
	"victory-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"
)

type PageViewDynamoRepository struct {
	db        *dynamodb.Client
	tableName string
}

func NewPageViewDynamoRepository(db *dynamodb.Client, table string) *PageViewDynamoRepository {
	return &PageViewDynamoRepository{db: db, tableName: table}
}

func (r *PageViewDynamoRepository) AddPageView(pageView domain.PageView) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	if pageView.ID == "" {
		pageView.ID = uuid.New().String()
	}

	// Set ViewedAt timestamp if not already set
	if pageView.ViewedAt.IsZero() {
		pageView.ViewedAt = time.Now()
	}

	item, err := attributevalue.MarshalMap(pageView)
	if err != nil {
		return err
	}

	_, err = r.db.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: &r.tableName,
		Item:      item,
	})
	return err
}

func (r *PageViewDynamoRepository) GetPageViewsByDateRange(startDate, endDate time.Time) ([]domain.PageView, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	// Convert dates to strings for comparison
	startDateStr := startDate.Format(time.RFC3339)
	endDateStr := endDate.Format(time.RFC3339)

	// Paged Scan (issue #41): pageviews accumulate quickly, so a date range
	// over a busy period easily exceeds one 1 MB page.
	items, err := scanPages(ctx, r.db, &dynamodb.ScanInput{
		TableName:        &r.tableName,
		FilterExpression: aws.String("viewed_at BETWEEN :start_date AND :end_date"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":start_date": &types.AttributeValueMemberS{Value: startDateStr},
			":end_date":   &types.AttributeValueMemberS{Value: endDateStr},
		},
	})
	if err != nil {
		return nil, err
	}

	var pageViews []domain.PageView
	err = attributevalue.UnmarshalListOfMaps(items, &pageViews)
	if err != nil {
		return nil, err
	}

	return pageViews, nil
}

func (r *PageViewDynamoRepository) GetAllPageViews() ([]domain.PageView, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	// Paged Scan (issue #41).
	items, err := scanPages(ctx, r.db, &dynamodb.ScanInput{
		TableName: &r.tableName,
	})
	if err != nil {
		return nil, err
	}

	var pageViews []domain.PageView
	err = attributevalue.UnmarshalListOfMaps(items, &pageViews)
	if err != nil {
		return nil, err
	}

	return pageViews, nil
}

func (r *PageViewDynamoRepository) GetPageViewsByUserID(userID string) ([]domain.PageView, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	// Paged Query (issue #41): an active user's partition can exceed 1 MB.
	items, err := queryPages(ctx, r.db, &dynamodb.QueryInput{
		TableName:              &r.tableName,
		IndexName:              aws.String("user_id-index"),
		KeyConditionExpression: aws.String("user_id = :uid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":uid": &types.AttributeValueMemberS{Value: userID},
		},
	})
	if err != nil {
		return nil, err
	}

	var pageViews []domain.PageView
	err = attributevalue.UnmarshalListOfMaps(items, &pageViews)
	if err != nil {
		return nil, err
	}

	return pageViews, nil
}
