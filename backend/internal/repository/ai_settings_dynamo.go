package repository

import (
	"context"
	"victory-contest-go/internal/awsconfig"
	"victory-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

// AiSettingsDynamoRepository stores the single AI feature-settings row in the
// "ai_settings" table (single "id" hash key, item id = domain.AISettingsID),
// provisioned by cmd/setup-tables. Same (db, table) constructor +
// awsconfig.CallCtx conventions as ai_provider_dynamo.go.
type AiSettingsDynamoRepository struct {
	db        *dynamodb.Client
	tableName string
}

func NewAiSettingsDynamoRepository(db *dynamodb.Client, table string) *AiSettingsDynamoRepository {
	return &AiSettingsDynamoRepository{db: db, tableName: table}
}

// GetSettings reads the one settings row. A missing item is not an error:
// it reads back as the zero settings (require_premium = false), which is
// exactly the pre-feature public behavior.
func (r *AiSettingsDynamoRepository) GetSettings() (domain.AISettings, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	var s domain.AISettings
	key, err := attributevalue.MarshalMap(map[string]string{"id": domain.AISettingsID})
	if err != nil {
		return s, err
	}
	out, err := r.db.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: &r.tableName,
		Key:       key,
	})
	if err != nil {
		return s, err
	}
	if out.Item == nil {
		return domain.AISettings{ID: domain.AISettingsID}, nil
	}
	if err := attributevalue.UnmarshalMap(out.Item, &s); err != nil {
		return s, err
	}
	return s, nil
}

// SaveSettings upserts the single row (PutItem on a fixed key — no
// read-modify-write races are possible on one row owned by one admin panel).
func (r *AiSettingsDynamoRepository) SaveSettings(s domain.AISettings) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	s.ID = domain.AISettingsID
	item, err := attributevalue.MarshalMap(s)
	if err != nil {
		return err
	}
	_, err = r.db.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: &r.tableName,
		Item:      item,
	})
	return err
}
