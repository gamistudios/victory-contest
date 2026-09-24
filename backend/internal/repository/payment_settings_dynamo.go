package repository

import (
	"context"
	"victor-contest-go/internal/awsconfig"
	"victor-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

// PaymentSettingsDynamoRepository stores the single payment-feature-settings
// row in the "payment_settings" table (single "id" hash key, item id =
// domain.PaymentSettingsID), provisioned by cmd/setup-tables. Same
// (db, table) constructor + awsconfig.CallCtx conventions as
// ai_settings_dynamo.go.
type PaymentSettingsDynamoRepository struct {
	db        *dynamodb.Client
	tableName string
}

func NewPaymentSettingsDynamoRepository(db *dynamodb.Client, table string) *PaymentSettingsDynamoRepository {
	return &PaymentSettingsDynamoRepository{db: db, tableName: table}
}

// GetSettings reads the one settings row. A missing item is not an error: it
// reads back as the zero settings (allow_stars = false), which is exactly the
// Stars-hidden default the student UI expects.
func (r *PaymentSettingsDynamoRepository) GetSettings() (domain.PaymentSettings, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	var s domain.PaymentSettings
	key, err := attributevalue.MarshalMap(map[string]string{"id": domain.PaymentSettingsID})
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
		return domain.PaymentSettings{ID: domain.PaymentSettingsID}, nil
	}
	if err := attributevalue.UnmarshalMap(out.Item, &s); err != nil {
		return s, err
	}
	return s, nil
}

// SaveSettings upserts the single row (PutItem on a fixed key — no
// read-modify-write races are possible on one row owned by one admin panel).
func (r *PaymentSettingsDynamoRepository) SaveSettings(s domain.PaymentSettings) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	s.ID = domain.PaymentSettingsID
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
