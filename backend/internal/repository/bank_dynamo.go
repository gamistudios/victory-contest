package repository

import (
	"context"
	"sort"
	"time"
	"victor-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/google/uuid"
)

type BankDynamoRepository struct {
	db        *dynamodb.Client
	tableName string
}

func NewBankDynamoRepository(region string, tablename string) *BankDynamoRepository {
	cfg, err := config.LoadDefaultConfig(context.TODO(),
		config.WithRegion(region),
	)
	if err != nil {
		panic("unable to load AWS SDK config: " + err.Error())
	}
	return &BankDynamoRepository{
		db:        dynamodb.NewFromConfig(cfg),
		tableName: tablename,
	}
}

func (r *BankDynamoRepository) AddBank(bank domain.Bank) (string, error) {
	if bank.ID == "" {
		bank.ID = uuid.New().String()
	}
	if bank.CreatedAt == "" {
		bank.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	item, err := attributevalue.MarshalMap(bank)
	if err != nil {
		return "", err
	}
	_, err = r.db.PutItem(context.TODO(), &dynamodb.PutItemInput{
		TableName: &r.tableName,
		Item:      item,
	})
	if err != nil {
		return "", err
	}
	return bank.ID, nil
}

func (r *BankDynamoRepository) UpdateBank(id string, update domain.Bank) error {
	update.ID = id
	item, err := attributevalue.MarshalMap(update)
	if err != nil {
		return err
	}
	_, err = r.db.PutItem(context.TODO(), &dynamodb.PutItemInput{
		TableName: &r.tableName,
		Item:      item,
	})
	return err
}

func (r *BankDynamoRepository) DeleteBank(id string) error {
	key, err := attributevalue.MarshalMap(map[string]string{"id": id})
	if err != nil {
		return err
	}
	_, err = r.db.DeleteItem(context.TODO(), &dynamodb.DeleteItemInput{
		TableName: &r.tableName,
		Key:       key,
	})
	return err
}

func (r *BankDynamoRepository) GetBankByID(id string) (*domain.Bank, error) {
	key, err := attributevalue.MarshalMap(map[string]string{"id": id})
	if err != nil {
		return nil, err
	}
	out, err := r.db.GetItem(context.TODO(), &dynamodb.GetItemInput{
		TableName: &r.tableName,
		Key:       key,
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, nil
	}
	var bank domain.Bank
	err = attributevalue.UnmarshalMap(out.Item, &bank)
	if err != nil {
		return nil, err
	}
	return &bank, nil
}

func (r *BankDynamoRepository) GetAllBanks() ([]domain.Bank, error) {
	out, err := r.db.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName: &r.tableName,
	})
	if err != nil {
		return nil, err
	}
	var banks []domain.Bank
	err = attributevalue.UnmarshalListOfMaps(out.Items, &banks)
	if err != nil {
		return nil, err
	}
	sort.SliceStable(banks, func(i, j int) bool {
		if banks[i].DisplayOrder != banks[j].DisplayOrder {
			return banks[i].DisplayOrder < banks[j].DisplayOrder
		}
		return banks[i].Name < banks[j].Name
	})
	return banks, nil
}
