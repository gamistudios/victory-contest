package repository

import (
	"context"
	"errors"
	"fmt"
	"time"
	"victory-contest-go/internal/awsconfig"
	"victory-contest-go/internal/domain"
	usecase "victory-contest-go/internal/usecase"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"
)

type dynamoDBPaymentRepository struct {
	db        *dynamodb.Client
	tableName string
}

// normalizeReason folds the legacy `reason` attribute (written by older builds
// of UpdateStatus, README #43) into rejection_reason when the latter is empty,
// then clears it so nothing ever writes `reason` back.
func normalizeReason(p *domain.PaymentRequest) {
	if p.RejectionReason == "" {
		p.RejectionReason = p.LegacyReason
	}
	p.LegacyReason = ""
}

func normalizeReasons(payments []domain.PaymentRequest) {
	for i := range payments {
		normalizeReason(&payments[i])
	}
}

// ListAll implements usecase.PaymentRepository.
//
// Queries the GSI1PK-user_id-index on the partition key only (GSI1PK =
// "PAYMENT_REQUEST"): every payment row written by Create carries that value,
// so this returns all payment requests. The previous version pinned the
// user_id range key to a hardcoded debug value ("112pay"), so the endpoint
// returned nothing meaningful (issue #19).
func (r *dynamoDBPaymentRepository) ListAll() ([]domain.PaymentRequest, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	var payments []domain.PaymentRequest
	gsi1PK, err := attributevalue.Marshal("PAYMENT_REQUEST")
	if err != nil {
		return nil, err
	}

	// Paged Query (issue #41): the single GSI1PK partition holds every
	// payment row and grows past 1 MB.
	items, err := queryPages(ctx, r.db, &dynamodb.QueryInput{
		TableName:              aws.String(r.tableName),
		IndexName:              aws.String("GSI1PK-user_id-index"),
		KeyConditionExpression: aws.String("GSI1PK = :gsi1pk"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":gsi1pk": gsi1PK,
		},
	})
	if err != nil {
		return nil, err
	}
	if err := attributevalue.UnmarshalListOfMaps(items, &payments); err != nil {
		return nil, fmt.Errorf("failed to unmarshal payments: %w", err)
	}
	normalizeReasons(payments)
	return payments, nil
}

func NewDynamoDBPaymentRepository(db *dynamodb.Client, table string) usecase.PaymentRepository {
	return &dynamoDBPaymentRepository{db: db, tableName: table}
}

func (r *dynamoDBPaymentRepository) Create(req *domain.PaymentRequest) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	if req.ID == "" {
		req.ID = uuid.New().String()
	}
	req.GSI1PK = "PAYMENT_REQUEST"
	item, err := attributevalue.MarshalMap(req)
	if err != nil {
		return fmt.Errorf("failed to marshal payment request: %w", err)
	}

	_, err = r.db.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(r.tableName),
		Item:      item,
	})
	if err != nil {
		return fmt.Errorf("failed to put item in dynamodb: %w", err)
	}
	return nil
}

func (r *dynamoDBPaymentRepository) GetByID(id string) (*domain.PaymentRequest, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	key, err := attributevalue.MarshalMap(map[string]string{"id": id})
	if err != nil {
		return nil, err
	}

	out, err := r.db.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(r.tableName),
		Key:       key,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get item: %w", err)
	}
	if out.Item == nil {
		return nil, errors.New("payment request not found")
	}

	var req domain.PaymentRequest
	if err := attributevalue.UnmarshalMap(out.Item, &req); err != nil {
		return nil, fmt.Errorf("failed to unmarshal item: %w", err)
	}
	normalizeReason(&req)
	return &req, nil
}

// DeletePayment removes a payment request row by primary key. The conditional
// write (attribute_exists(id)) reports a missing row as usecase.ErrPaymentNotFound
// in a single round-trip so the handler can answer 404. Note: no auth
// middleware exists in this codebase yet (README #6); this matches the
// unauthenticated style of the other delete endpoints.
func (r *dynamoDBPaymentRepository) DeletePayment(id string) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	key, err := attributevalue.MarshalMap(map[string]string{"id": id})
	if err != nil {
		return fmt.Errorf("failed to marshal key: %w", err)
	}
	_, err = r.db.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName:                aws.String(r.tableName),
		Key:                      key,
		ConditionExpression:      aws.String("attribute_exists(#id)"),
		ExpressionAttributeNames: map[string]string{"#id": "id"},
	})
	if err != nil {
		var ccf *types.ConditionalCheckFailedException
		if errors.As(err, &ccf) {
			return usecase.ErrPaymentNotFound
		}
		return fmt.Errorf("failed to delete payment: %w", err)
	}
	return nil
}

func (r *dynamoDBPaymentRepository) UpdateStatus(id string, newStatus domain.PaymentStatus, reason string) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	// ✅ Use the full composite key
	key, err := attributevalue.MarshalMap(map[string]string{
		"id": id,
	})
	if err != nil {
		return fmt.Errorf("failed to marshal key: %w", err)
	}

	// Only rejection_reason is written: the legacy `reason` attribute was a bug
	// (README #43) - reads still fold it in as a fallback (see normalizeReasons).
	updateExpression := "SET #status = :status, #updatedAt = :updatedAt"
	expressionAttributeNames := map[string]string{
		"#status":    "status",
		"#updatedAt": "updated_at",
	}

	expressionAttributeValues, err := attributevalue.MarshalMap(map[string]any{
		":status":    newStatus,
		":updatedAt": time.Now().UTC(),
	})
	if err != nil {
		return fmt.Errorf("failed to marshal base values: %w", err)
	}

	if reason != "" {
		updateExpression += ", #rejectionReason = :rejectionReason"
		expressionAttributeNames["#rejectionReason"] = "rejection_reason"

		reasonValue, marshalErr := attributevalue.Marshal(reason)
		if marshalErr != nil {
			return fmt.Errorf("failed to marshal reason: %w", marshalErr)
		}
		expressionAttributeValues[":rejectionReason"] = reasonValue
	}

	_, err = r.db.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                 aws.String(r.tableName),
		Key:                       key,
		UpdateExpression:          aws.String(updateExpression),
		ExpressionAttributeNames:  expressionAttributeNames,
		ExpressionAttributeValues: expressionAttributeValues,
	})

	if err != nil {
		return fmt.Errorf("failed to update item: %w", err)
	}
	return nil
}

// ListByStatus requires a Global Secondary Index (GSI) on the 'status' attribute.
// GSI Name: 'StatusIndex'
// Partition Key: 'status'
func (r *dynamoDBPaymentRepository) ListByStatus(status domain.PaymentStatus) ([]domain.PaymentRequest, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	var payments []domain.PaymentRequest
	st, err := attributevalue.Marshal(status)
	if err != nil {
		return nil, err
	}
	gsi1PK, err := attributevalue.Marshal("PAYMENT_REQUEST")
	if err != nil {
		return nil, fmt.Errorf("failed to marshal GSI PK: %w", err)
	}
	// Paged Query (issue #41): a status bucket (e.g. "pending") can exceed
	// one page.
	items, err := queryPages(ctx, r.db, &dynamodb.QueryInput{
		TableName:              aws.String(r.tableName),
		IndexName:              aws.String("GSI1PK-status-index"),
		KeyConditionExpression: aws.String("GSI1PK = :gsi1pk AND #st = :status"),
		ExpressionAttributeNames: map[string]string{
			"#st": "status",
		},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":gsi1pk": gsi1PK,
			":status": st,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to query by status: %w", err)
	}

	if err := attributevalue.UnmarshalListOfMaps(items, &payments); err != nil {
		return nil, fmt.Errorf("failed to unmarshal payments: %w", err)
	}
	normalizeReasons(payments)
	return payments, nil
}

// ListByUser requires a Global Secondary Index (GSI) on the 'user_id' attribute.
// GSI Name: 'UserIndex'
// Partition Key: 'user_id'
func (r *dynamoDBPaymentRepository) ListByUser(userID string) ([]domain.PaymentRequest, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	var payments []domain.PaymentRequest
	gsi1PK, err := attributevalue.Marshal("PAYMENT_REQUEST")
	if err != nil {
		return nil, err
	}

	// Paged Query (issue #41).
	items, err := queryPages(ctx, r.db, &dynamodb.QueryInput{
		TableName:              aws.String(r.tableName),
		IndexName:              aws.String("GSI1PK-user_id-index"),
		KeyConditionExpression: aws.String("GSI1PK = :gsi1pk AND #st = :user_id"),
		ExpressionAttributeNames: map[string]string{
			"#st": "user_id",
		},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":gsi1pk":  gsi1PK,
			":user_id": &types.AttributeValueMemberS{Value: userID},
		},
	})
	if err != nil {
		return nil, err
	}
	if err := attributevalue.UnmarshalListOfMaps(items, &payments); err != nil {
		return nil, fmt.Errorf("failed to unmarshal payments: %w", err)
	}
	normalizeReasons(payments)
	return payments, nil
}

// ListExpired uses the new sparse GSI.
// GSI Name: 'ExpirationIndex'
// Partition Key: 'expirationDate'
func (r *dynamoDBPaymentRepository) ListExpired(now time.Time) ([]domain.PaymentRequest, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	var payments []domain.PaymentRequest
	nowStr, err := attributevalue.Marshal(now)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal current time: %w", err)
	}
	gsi1PK, err := attributevalue.Marshal("PAYMENT_REQUEST")
	if err != nil {
		return nil, fmt.Errorf("failed to marshal GSI PK: %w", err)
	}
	// Paged Query (issue #41): the expired range can span many pages.
	items, err := queryPages(ctx, r.db, &dynamodb.QueryInput{
		TableName:              aws.String(r.tableName),
		IndexName:              aws.String("GSI1PK-expirationDate-index"),
		KeyConditionExpression: aws.String("GSI1PK = :gsi1pk AND expirationDate < :now"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":gsi1pk": gsi1PK,
			":now":    nowStr,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to query for expired payments: %w", err)
	}

	if err := attributevalue.UnmarshalListOfMaps(items, &payments); err != nil {
		return nil, fmt.Errorf("failed to unmarshal expired payments: %w", err)
	}
	normalizeReasons(payments)
	return payments, nil
}
