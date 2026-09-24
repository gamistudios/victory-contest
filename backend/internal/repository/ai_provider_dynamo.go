package repository

import (
	"context"
	"sort"
	"time"
	"victory-contest-go/internal/awsconfig"
	"victory-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/google/uuid"
)

// AiProviderDynamoRepository stores admin-managed AI providers in the
// "ai_providers" table (single "id" hash key, provisioned by
// cmd/setup-tables). Same (db, table) constructor + awsconfig.CallCtx +
// scanPages conventions as every other repository (issues #41/#45/#46).
type AiProviderDynamoRepository struct {
	db        *dynamodb.Client
	tableName string
}

func NewAiProviderDynamoRepository(db *dynamodb.Client, table string) *AiProviderDynamoRepository {
	return &AiProviderDynamoRepository{db: db, tableName: table}
}

func (r *AiProviderDynamoRepository) AddProvider(p domain.AIProvider) (string, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	if p.ID == "" {
		p.ID = uuid.New().String()
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if p.CreatedAt == "" {
		p.CreatedAt = now
	}
	p.UpdatedAt = now
	item, err := attributevalue.MarshalMap(p)
	if err != nil {
		return "", err
	}
	if _, err := r.db.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: &r.tableName,
		Item:      item,
	}); err != nil {
		return "", err
	}
	return p.ID, nil
}

func (r *AiProviderDynamoRepository) UpdateProvider(p domain.AIProvider) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	p.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	item, err := attributevalue.MarshalMap(p)
	if err != nil {
		return err
	}
	_, err = r.db.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: &r.tableName,
		Item:      item,
	})
	return err
}

func (r *AiProviderDynamoRepository) DeleteProvider(id string) error {
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

func (r *AiProviderDynamoRepository) GetProviderByID(id string) (*domain.AIProvider, error) {
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
	var p domain.AIProvider
	if err := attributevalue.UnmarshalMap(out.Item, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *AiProviderDynamoRepository) GetAllProviders() ([]domain.AIProvider, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	// Paged Scan, same as every other list path (issue #41).
	items, err := scanPages(ctx, r.db, &dynamodb.ScanInput{
		TableName: &r.tableName,
	})
	if err != nil {
		return nil, err
	}
	var providers []domain.AIProvider
	if err := attributevalue.UnmarshalListOfMaps(items, &providers); err != nil {
		return nil, err
	}
	sort.SliceStable(providers, func(i, j int) bool {
		return providers[i].CreatedAt < providers[j].CreatedAt
	})
	return providers, nil
}
