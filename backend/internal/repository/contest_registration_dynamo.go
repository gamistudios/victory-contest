package repository

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"victor-contest-go/internal/awsconfig"
	"victor-contest-go/internal/domain"
	"victor-contest-go/internal/usecase"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type ContestRegistrationDynamoRepository struct {
	db        *dynamodb.Client
	tableName string
}

func NewContestRegistrationDynamoRepository(db *dynamodb.Client, table string) *ContestRegistrationDynamoRepository {
	return &ContestRegistrationDynamoRepository{db: db, tableName: table}
}

func (r *ContestRegistrationDynamoRepository) AddContestRegistration(registration domain.ContestRegistration) (string, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	if registration.ID == "" {
		numBytes := 5
		randomBytes := make([]byte, numBytes)

		_, err := rand.Read(randomBytes)
		if err != nil {
			return "", err
		}

		id := base64.RawURLEncoding.EncodeToString(randomBytes)
		registration.ID = id
	}
	item, err := attributevalue.MarshalMap(registration)
	if err != nil {
		return "", errors.New("invalid registration data")
	}
	_, err = r.db.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: &r.tableName,
		Item:      item,
	})
	if err != nil {
		return "", err
	}
	return registration.ID, nil
}

func (r *ContestRegistrationDynamoRepository) UpdateContestRegistration(id string, update domain.ContestRegistration) error {
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

// UpdateContestRegistrationIfExist writes the registration only while the row
// still exists (ConditionExpression attribute_exists(id)) — the same recipe as
// StudentDynamoRepository.UpdateStudentIfExist. It refuses to resurrect a
// registration a concurrent delete removed, and the activation flow in the
// usecase re-reads and retries once on conflict. A
// ConditionalCheckFailedException is mapped to usecase.ErrConditionalCheckFailed.
func (r *ContestRegistrationDynamoRepository) UpdateContestRegistrationIfExist(registration domain.ContestRegistration) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	item, err := attributevalue.MarshalMap(registration)
	if err != nil {
		return err
	}
	_, err = r.db.PutItem(ctx, &dynamodb.PutItemInput{
		TableName:           &r.tableName,
		Item:                item,
		ConditionExpression: aws.String("attribute_exists(id)"),
	})
	if err != nil {
		var ccf *types.ConditionalCheckFailedException
		if errors.As(err, &ccf) {
			return fmt.Errorf("%w: contest registration %s", usecase.ErrConditionalCheckFailed, registration.ID)
		}
		return err
	}
	return nil
}

func (r *ContestRegistrationDynamoRepository) DeleteContestRegistration(id string) error {
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

func (r *ContestRegistrationDynamoRepository) GetRegistrationsByContestAndStudent(contestID string, user_id string) (*domain.ContestRegistration, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	contestId, err := attributevalue.Marshal(contestID)
	if err != nil {
		return nil, err
	}
	studentId, err := attributevalue.Marshal(user_id)
	if err != nil {
		return nil, err
	}
	out, err := r.db.Query(ctx, &dynamodb.QueryInput{
		TableName:              &r.tableName,
		KeyConditionExpression: aws.String("contest_id = :contestId AND student_id = :studentId"),
		IndexName:              aws.String("contest_id-student_id-index"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":contestId": contestId,
			":studentId": studentId,
		},
	})
	if err != nil {
		return nil, err
	}

	if len(out.Items) == 0 {
		return nil, nil
	}

	var registration domain.ContestRegistration
	err = attributevalue.UnmarshalMap(out.Items[0], &registration)
	if err != nil {
		return nil, err
	}

	return &registration, nil

}
func (r *ContestRegistrationDynamoRepository) GetRegistrationsByContest(contest_id string) ([]domain.ContestRegistration, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	contestId, err := attributevalue.Marshal(contest_id)
	if err != nil {
		return nil, err
	}
	// Paged Query (issue #41): a contest partition with many registrations
	// can exceed one 1 MB page.
	items, err := queryPages(ctx, r.db, &dynamodb.QueryInput{
		TableName:              &r.tableName,
		KeyConditionExpression: aws.String("contest_id = :contestId"),
		IndexName:              aws.String("contest_id-student_id-index"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":contestId": contestId,
		},
	})
	if err != nil {
		return nil, err
	}

	if len(items) == 0 {
		return nil, nil
	}
	var registerations []domain.ContestRegistration
	err = attributevalue.UnmarshalListOfMaps(items, &registerations)
	if err != nil {
		return nil, err
	}
	return registerations, nil
}

// ListAll returns every contest registration row via a paged table Scan
// (issue #3): the admin dashboard used to issue one GetRegistrationsByContest
// GSI query per contest (N+1). Same plain-Scan recipe as the other repos
// (e.g. AchievementDynamoRepository.GetAllAchievements), paged until
// LastEvaluatedKey is nil so large tables are no longer truncated at 1 MB
// (issue #41).
func (r *ContestRegistrationDynamoRepository) ListAll() ([]domain.ContestRegistration, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	items, err := scanPages(ctx, r.db, &dynamodb.ScanInput{
		TableName: &r.tableName,
	})
	if err != nil {
		return nil, err
	}
	var registrations []domain.ContestRegistration
	err = attributevalue.UnmarshalListOfMaps(items, &registrations)
	if err != nil {
		return nil, err
	}
	return registrations, nil
}
