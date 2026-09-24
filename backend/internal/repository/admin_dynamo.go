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

type AdminDynamoRepository struct {
	db        *dynamodb.Client
	tableName string
}

func NewAdminDynamoRepository(db *dynamodb.Client, table string) *AdminDynamoRepository {
	return &AdminDynamoRepository{db: db, tableName: table}
}

func (r *AdminDynamoRepository) AddAdmin(admin domain.Admin) (string, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	if admin.ID == "" {
		admin.ID = uuid.New().String()
	}
	item, err := attributevalue.MarshalMap(admin)
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
	return admin.ID, nil
}

func (r *AdminDynamoRepository) UpdateAdmin(id string, update domain.Admin) error {
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

func (r *AdminDynamoRepository) DeleteAdmin(id string) error {
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

func (r *AdminDynamoRepository) GetAdminByID(id string) (*domain.Admin, error) {
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
	var admin domain.Admin
	err = attributevalue.UnmarshalMap(out.Item, &admin)
	if err != nil {
		return nil, err
	}
	return &admin, nil
}
func (r *AdminDynamoRepository) GetAdminByEmail(email string) (*domain.Admin, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	key, err := attributevalue.Marshal(email)
	if err != nil {
		return nil, err
	}
	out, err := r.db.Query(ctx, &dynamodb.QueryInput{
		IndexName:              aws.String("email-id-index"),
		TableName:              &r.tableName,
		KeyConditionExpression: aws.String("email = :email"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":email": key,
		},
	})
	if err != nil {
		return nil, err
	}
	if len(out.Items) == 0 {
		return nil, nil
	}
	var admin domain.Admin
	err = attributevalue.UnmarshalMap(out.Items[0], &admin)
	if err != nil {
		return nil, err
	}
	return &admin, nil

}
func (r *AdminDynamoRepository) GetAllAdmins() ([]domain.Admin, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	out, err := r.db.Scan(ctx, &dynamodb.ScanInput{
		TableName: &r.tableName,
	})
	if err != nil {
		return nil, err
	}
	var admins []domain.Admin
	err = attributevalue.UnmarshalListOfMaps(out.Items, &admins)
	if err != nil {
		return nil, err
	}
	return admins, nil
}
