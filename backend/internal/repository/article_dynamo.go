package repository

import (
	"context"
	"errors"
	"time"
	"victor-contest-go/internal/awsconfig"
	"victor-contest-go/internal/domain"
	"victor-contest-go/internal/usecase"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type ArticleDynamoRepository struct {
	db        *dynamodb.Client
	tableName string
}

func NewArticleDynamoRepository(db *dynamodb.Client, table string) *ArticleDynamoRepository {
	return &ArticleDynamoRepository{db: db, tableName: table}
}

func (r *ArticleDynamoRepository) Create(article domain.Article) (string, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()

	article.CreatedAt = time.Now()
	article.UpdatedAt = time.Now()
	article.ViewCount = 0
	article.LikeCount = 0

	// Set default author if not provided
	if article.Author.Name == "" {
		article.Author = domain.Author{
			ID:     "1",
			Name:   "Admin User",
			Avatar: "",
		}
	}

	// Set empty tags if not provided
	if article.Tags == nil {
		article.Tags = []string{}
	}

	// Set default status if not provided
	if article.Status == "" {
		article.Status = domain.ArticleStatusDraft
	}

	// Calculate read time
	article.ReadTime = estimateReadTime(article.Content)

	item, err := attributevalue.MarshalMap(article)
	if err != nil {
		return "", err
	}
	_, err = r.db.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(r.tableName),
		Item:      item,
	})

	return article.ID, err
}

func (r *ArticleDynamoRepository) Update(id string, update domain.Article) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	update.ID = id
	update.UpdatedAt = time.Now()
	if update.ReadTime == 0 {
		update.ReadTime = estimateReadTime(update.Content)
	}

	// Ensure author is set
	if update.Author.ID == "" {
		update.Author = domain.Author{
			ID:     "1",
			Name:   "Admin User",
			Avatar: "https://via.placeholder.com/40",
		}
	}

	// Ensure tags is not nil
	if update.Tags == nil {
		update.Tags = []string{}
	}

	item, err := attributevalue.MarshalMap(update)
	if err != nil {
		return err
	}
	_, err = r.db.PutItem(ctx, &dynamodb.PutItemInput{TableName: &r.tableName, Item: item})
	return err
}

func (r *ArticleDynamoRepository) Delete(id string) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	key, err := attributevalue.MarshalMap(map[string]string{"id": id})
	if err != nil {
		return err
	}
	_, err = r.db.DeleteItem(ctx, &dynamodb.DeleteItemInput{TableName: &r.tableName, Key: key})
	return err
}

func (r *ArticleDynamoRepository) GetByID(id string) (*domain.Article, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	key, err := attributevalue.MarshalMap(map[string]string{"id": id})
	if err != nil {
		return nil, err
	}
	out, err := r.db.GetItem(ctx, &dynamodb.GetItemInput{TableName: &r.tableName, Key: key})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, nil
	}
	var a domain.Article
	if err := attributevalue.UnmarshalMap(out.Item, &a); err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *ArticleDynamoRepository) List() ([]domain.Article, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	// Paged Scan (issue #41).
	items, err := scanPages(ctx, r.db, &dynamodb.ScanInput{TableName: &r.tableName})
	if err != nil {
		return nil, err
	}
	var list []domain.Article
	if err := attributevalue.UnmarshalListOfMaps(items, &list); err != nil {
		return nil, err
	}
	return list, nil
}

func (r *ArticleDynamoRepository) ListPublished() ([]domain.Article, error) {
	// Basic scan + filter client-side (optimize with GSI in production)
	items, err := r.GetByStatus(domain.ArticleStatusPublished)
	if err != nil {
		return nil, err
	}
	return items, nil
}

func (r *ArticleDynamoRepository) GetByStatus(status domain.ArticleStatus) ([]domain.Article, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	// Paged Query (issue #41): a status partition can exceed one 1 MB page.
	items, err := queryPages(ctx, r.db, &dynamodb.QueryInput{
		TableName:              &r.tableName,
		IndexName:              aws.String("status-index"),
		KeyConditionExpression: aws.String("#st = :status"),
		ExpressionAttributeNames: map[string]string{
			"#st": "status",
		},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":status": &types.AttributeValueMemberS{Value: string(status)},
		},
	})

	if err != nil {
		return nil, err
	}
	var list []domain.Article
	if err := attributevalue.UnmarshalListOfMaps(items, &list); err != nil {
		return nil, err
	}
	return list, nil
}

func (r *ArticleDynamoRepository) IncrementView(id string) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	input := &dynamodb.UpdateItemInput{
		TableName: aws.String(r.tableName),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: id},
		},
		UpdateExpression: aws.String("SET viewCount = if_not_exists(viewCount, :zero) + :inc"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":inc":  &types.AttributeValueMemberN{Value: "1"},
			":zero": &types.AttributeValueMemberN{Value: "0"},
		},
	}

	_, err := r.db.UpdateItem(ctx, input)
	return err
}

func (r *ArticleDynamoRepository) IncrementLike(id string) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	input := &dynamodb.UpdateItemInput{
		TableName: aws.String(r.tableName),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: id},
		},
		UpdateExpression: aws.String("SET likeCount = if_not_exists(likeCount, :zero) + :inc"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":inc":  &types.AttributeValueMemberN{Value: "1"},
			":zero": &types.AttributeValueMemberN{Value: "0"},
		},
	}

	_, err := r.db.UpdateItem(ctx, input)
	return err
}
func (r *ArticleDynamoRepository) IncrementComments(id string) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	input := &dynamodb.UpdateItemInput{
		TableName: aws.String(r.tableName),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: id},
		},
		UpdateExpression: aws.String("SET commentCount = if_not_exists(commentCount, :zero) + :inc"),
		// never create an item for a missing article
		ConditionExpression: aws.String("attribute_exists(id)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":inc":  &types.AttributeValueMemberN{Value: "1"},
			":zero": &types.AttributeValueMemberN{Value: "0"},
		},
	}

	_, err := r.db.UpdateItem(ctx, input)
	var conditionalFailed *types.ConditionalCheckFailedException
	if errors.As(err, &conditionalFailed) {
		return usecase.ErrArticleNotFound
	}
	return err
}
func (r *ArticleDynamoRepository) DecrementView(id string) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	input := &dynamodb.UpdateItemInput{
		TableName: aws.String(r.tableName),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: id},
		},
		UpdateExpression:    aws.String("SET viewCount = if_not_exists(viewCount, :zero) - :dec"),
		ConditionExpression: aws.String("viewCount > :zero"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":dec":  &types.AttributeValueMemberN{Value: "1"},
			":zero": &types.AttributeValueMemberN{Value: "0"},
		},
	}

	_, err := r.db.UpdateItem(ctx, input)
	return err
}

func (r *ArticleDynamoRepository) DecrementLike(id string) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	input := &dynamodb.UpdateItemInput{
		TableName: aws.String(r.tableName),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: id},
		},
		UpdateExpression:    aws.String("SET likeCount = if_not_exists(likeCount, :zero) - :dec"),
		ConditionExpression: aws.String("likeCount > :zero"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":dec":  &types.AttributeValueMemberN{Value: "1"},
			":zero": &types.AttributeValueMemberN{Value: "0"},
		},
	}

	_, err := r.db.UpdateItem(ctx, input)
	return err
}

// DecrementComments mirrors IncrementComments; used when a comment is deleted.
// if_not_exists starts from 1 so a missing counter lands at 0 instead of -1.
func (r *ArticleDynamoRepository) DecrementComments(id string) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	input := &dynamodb.UpdateItemInput{
		TableName: aws.String(r.tableName),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: id},
		},
		UpdateExpression: aws.String("SET commentCount = if_not_exists(commentCount, :one) - :dec"),
		// never create an item for a missing article
		ConditionExpression: aws.String("attribute_exists(id)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":dec": &types.AttributeValueMemberN{Value: "1"},
			":one": &types.AttributeValueMemberN{Value: "1"},
		},
	}

	_, err := r.db.UpdateItem(ctx, input)
	var conditionalFailed *types.ConditionalCheckFailedException
	if errors.As(err, &conditionalFailed) {
		return usecase.ErrArticleNotFound
	}
	return err
}
func estimateReadTime(html string) int {
	// naive: 200 wpm
	words := 0
	start := -1
	for i, c := range html {
		if (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') {
			if start == -1 {
				start = i
			}
		} else if start != -1 {
			words++
			start = -1
		}
	}
	if start != -1 {
		words++
	}
	mins := max(words/200, 1)
	return mins
}
