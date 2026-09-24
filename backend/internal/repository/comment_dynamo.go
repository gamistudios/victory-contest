package repository

import (
	"context"
	"time"
	"victor-contest-go/internal/awsconfig"
	"victor-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"
)

type CommentDynamoRepository struct {
	db        *dynamodb.Client
	tableName string
}

func NewCommentDynamoRepository(db *dynamodb.Client, table string) *CommentDynamoRepository {
	return &CommentDynamoRepository{db: db, tableName: table}
}

func (r *CommentDynamoRepository) Create(comment domain.Comment) (string, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	comment.ID = uuid.New().String()
	comment.CreatedAt = time.Now().UTC()
	comment.UpdatedAt = time.Now().UTC()

	// Set default avatar if not provided
	if comment.Avatar == "" {
		comment.Avatar = "https://via.placeholder.com/40"
	}

	item, err := attributevalue.MarshalMap(comment)
	if err != nil {
		return "", err
	}

	_, err = r.db.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(r.tableName),
		Item:      item,
	})

	return comment.ID, err
}

func (r *CommentDynamoRepository) ListByArticleID(articleID string) ([]domain.Comment, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	input := &dynamodb.QueryInput{
		TableName:              aws.String(r.tableName), // Assuming you have a GSI on articleId
		KeyConditionExpression: aws.String("articleId = :articleId"),
		IndexName:              aws.String("articleId-index"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":articleId": &types.AttributeValueMemberS{Value: articleID},
		},
		ScanIndexForward: aws.Bool(false), // Sort by createdAt descending (newest first)
	}

	// Paged Query (issue #41): a popular article's comment partition can
	// exceed one 1 MB page; newest-first order is preserved across pages.
	items, err := queryPages(ctx, r.db, input)
	if err != nil {
		return nil, err
	}

	var comments []domain.Comment
	err = attributevalue.UnmarshalListOfMaps(items, &comments)
	if err != nil {
		return nil, err
	}

	return comments, nil
}

// GetByID returns the comment with the given id, or nil when it does not exist.
func (r *CommentDynamoRepository) GetByID(id string) (*domain.Comment, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	result, err := r.db.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(r.tableName),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: id},
		},
	})
	if err != nil {
		return nil, err
	}
	if len(result.Item) == 0 {
		return nil, nil
	}
	var comment domain.Comment
	if err := attributevalue.UnmarshalMap(result.Item, &comment); err != nil {
		return nil, err
	}
	return &comment, nil
}

// Update overwrites the comment item (read-modify-write done by the caller/usecase).
func (r *CommentDynamoRepository) Update(comment domain.Comment) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	item, err := attributevalue.MarshalMap(comment)
	if err != nil {
		return err
	}
	_, err = r.db.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(r.tableName),
		Item:      item,
	})
	return err
}

// Delete removes the comment item by id.
func (r *CommentDynamoRepository) Delete(id string) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	_, err := r.db.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(r.tableName),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: id},
		},
	})
	return err
}

// Fallback method if GSI is not available - scans the table (less efficient)
func (r *CommentDynamoRepository) ListByArticleIDScan(articleID string) ([]domain.Comment, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	input := &dynamodb.ScanInput{
		TableName:        aws.String(r.tableName),
		FilterExpression: aws.String("articleId = :articleId"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":articleId": &types.AttributeValueMemberS{Value: articleID},
		},
	}

	// Paged Scan (issue #41): filtered matches can live past the first page.
	items, err := scanPages(ctx, r.db, input)
	if err != nil {
		return nil, err
	}

	var comments []domain.Comment
	err = attributevalue.UnmarshalListOfMaps(items, &comments)
	if err != nil {
		return nil, err
	}

	return comments, nil
}
