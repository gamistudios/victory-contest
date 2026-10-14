package repository

import (
	"context"
	"encoding/json"

	"victory-contest-go/internal/awsconfig"
	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// LocationsDocID is the single reference_data row holding the location list.
const LocationsDocID = "locations"

type locationStore struct {
	db    *dynamodb.Client
	table string
}

func NewLocationDynamoStore(db *dynamodb.Client, table string) usecase.LocationStore {
	return &locationStore{db: db, table: table}
}

func (s *locationStore) Load() (*domain.Locations, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	out, err := s.db.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(s.table),
		Key:       map[string]types.AttributeValue{"id": &types.AttributeValueMemberS{Value: LocationsDocID}},
	})
	if err != nil || len(out.Item) == 0 {
		return nil, err
	}
	raw, ok := out.Item["json"].(*types.AttributeValueMemberS)
	if !ok {
		return nil, nil
	}
	var l domain.Locations
	if err := json.Unmarshal([]byte(raw.Value), &l); err != nil {
		return nil, err
	}
	return &l, nil
}

func (s *locationStore) Save(l domain.Locations) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	b, err := json.Marshal(l)
	if err != nil {
		return err
	}
	_, err = s.db.PutItem(ctx, &dynamodb.PutItemInput{TableName: aws.String(s.table), Item: map[string]types.AttributeValue{
		"id":   &types.AttributeValueMemberS{Value: LocationsDocID},
		"json": &types.AttributeValueMemberS{Value: string(b)},
	}})
	return err
}
