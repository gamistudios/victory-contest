package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"

	"victory-contest-go/internal/awsconfig"
	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// AcademyDynamoRepository persists Victory Academy data in two tables:
//
//   - content table: one item per content document, id = "<kind>#<id>"
//     (kinds: program, stream, subject, chapter, module, draft, meta); the
//     document itself is the JSON string in attribute "data".
//   - students table: one item per student (id = Telegram id) holding the JSON
//     learning state in "data" plus a numeric "version" used for optimistic
//     locking.
//
// Both tables use the plain "id" partition key created by schema.EnsureTables.
type AcademyDynamoRepository struct {
	db            *dynamodb.Client
	contentTable  string
	studentsTable string
}

func NewAcademyDynamoRepository(db *dynamodb.Client, contentTable, studentsTable string) *AcademyDynamoRepository {
	return &AcademyDynamoRepository{db: db, contentTable: contentTable, studentsTable: studentsTable}
}

func contentKey(kind, id string) string { return kind + "#" + id }

func contentItem(kind, id string, data []byte) map[string]types.AttributeValue {
	return map[string]types.AttributeValue{
		"id":         &types.AttributeValueMemberS{Value: contentKey(kind, id)},
		"kind":       &types.AttributeValueMemberS{Value: kind},
		"item_id":    &types.AttributeValueMemberS{Value: id},
		"data":       &types.AttributeValueMemberS{Value: string(data)},
		"updated_at": &types.AttributeValueMemberS{Value: time.Now().UTC().Format(time.RFC3339)},
	}
}

// ListContent returns every content document (strongly consistent, paged).
func (r *AcademyDynamoRepository) ListContent() ([]usecase.AcademyContentDoc, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	items, err := scanPages(ctx, r.db, &dynamodb.ScanInput{
		TableName:      &r.contentTable,
		ConsistentRead: aws.Bool(true),
	})
	if err != nil {
		return nil, err
	}
	docs := make([]usecase.AcademyContentDoc, 0, len(items))
	for _, it := range items {
		kind, _ := it["kind"].(*types.AttributeValueMemberS)
		id, _ := it["item_id"].(*types.AttributeValueMemberS)
		data, _ := it["data"].(*types.AttributeValueMemberS)
		if kind == nil || id == nil || data == nil {
			continue
		}
		docs = append(docs, usecase.AcademyContentDoc{Kind: kind.Value, ID: id.Value, Data: []byte(data.Value)})
	}
	return docs, nil
}

func (r *AcademyDynamoRepository) PutContent(kind, id string, data []byte) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	_, err := r.db.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: &r.contentTable,
		Item:      contentItem(kind, id, data),
	})
	return err
}

// PutContentIfAbsent writes the document only when it does not exist yet, so
// seeding can never overwrite an admin's edits. Reports whether it wrote.
func (r *AcademyDynamoRepository) PutContentIfAbsent(kind, id string, data []byte) (bool, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	_, err := r.db.PutItem(ctx, &dynamodb.PutItemInput{
		TableName:           &r.contentTable,
		Item:                contentItem(kind, id, data),
		ConditionExpression: aws.String("attribute_not_exists(id)"),
	})
	if err != nil {
		var ccf *types.ConditionalCheckFailedException
		if errors.As(err, &ccf) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (r *AcademyDynamoRepository) DeleteContent(kind, id string) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	_, err := r.db.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: &r.contentTable,
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: contentKey(kind, id)},
		},
	})
	return err
}

func decodeStudentState(item map[string]types.AttributeValue) (*domain.AcademyStudentState, error) {
	data, ok := item["data"].(*types.AttributeValueMemberS)
	if !ok {
		return nil, fmt.Errorf("academy student item has no data attribute")
	}
	var st domain.AcademyStudentState
	if err := json.Unmarshal([]byte(data.Value), &st); err != nil {
		return nil, err
	}
	if v, ok := item["version"].(*types.AttributeValueMemberN); ok {
		if n, err := strconv.ParseInt(v.Value, 10, 64); err == nil {
			st.Version = n
		}
	}
	return &st, nil
}

// GetStudentState returns nil (no error) when the student has no state yet.
func (r *AcademyDynamoRepository) GetStudentState(studentID string) (*domain.AcademyStudentState, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	out, err := r.db.GetItem(ctx, &dynamodb.GetItemInput{
		TableName:      &r.studentsTable,
		ConsistentRead: aws.Bool(true),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: studentID},
		},
	})
	if err != nil {
		return nil, err
	}
	if len(out.Item) == 0 {
		return nil, nil
	}
	return decodeStudentState(out.Item)
}

// PutStudentState writes the state when the stored version still equals
// expectedVersion (0 = the item must not exist yet). state.Version must
// already be expectedVersion+1. A lost race maps to
// usecase.ErrConditionalCheckFailed so the caller can re-read and retry.
func (r *AcademyDynamoRepository) PutStudentState(state *domain.AcademyStudentState, expectedVersion int64) error {
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	input := &dynamodb.PutItemInput{
		TableName: &r.studentsTable,
		Item: map[string]types.AttributeValue{
			"id":         &types.AttributeValueMemberS{Value: state.StudentID},
			"data":       &types.AttributeValueMemberS{Value: string(data)},
			"version":    &types.AttributeValueMemberN{Value: strconv.FormatInt(state.Version, 10)},
			"updated_at": &types.AttributeValueMemberS{Value: time.Now().UTC().Format(time.RFC3339)},
		},
	}
	if expectedVersion == 0 {
		input.ConditionExpression = aws.String("attribute_not_exists(id)")
	} else {
		input.ConditionExpression = aws.String("#v = :v")
		input.ExpressionAttributeNames = map[string]string{"#v": "version"}
		input.ExpressionAttributeValues = map[string]types.AttributeValue{
			":v": &types.AttributeValueMemberN{Value: strconv.FormatInt(expectedVersion, 10)},
		}
	}
	if _, err := r.db.PutItem(ctx, input); err != nil {
		var ccf *types.ConditionalCheckFailedException
		if errors.As(err, &ccf) {
			return fmt.Errorf("%w: academy student %s", usecase.ErrConditionalCheckFailed, state.StudentID)
		}
		return err
	}
	return nil
}

// ListStudentStates returns every student's learning state (admin analytics).
func (r *AcademyDynamoRepository) ListStudentStates() ([]domain.AcademyStudentState, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	items, err := scanPages(ctx, r.db, &dynamodb.ScanInput{TableName: &r.studentsTable})
	if err != nil {
		return nil, err
	}
	out := make([]domain.AcademyStudentState, 0, len(items))
	for _, it := range items {
		st, err := decodeStudentState(it)
		if err != nil {
			continue // a corrupt row must not break analytics
		}
		out = append(out, *st)
	}
	return out, nil
}
