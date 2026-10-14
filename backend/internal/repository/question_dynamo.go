package repository

import (
	"context"
	"errors"
	"strings"
	"time"
	"victory-contest-go/internal/awsconfig"
	"victory-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"
)

type QuestionDynamoRepository struct {
	db        *dynamodb.Client
	tableName string
}

func NewQuestionDynamoRepository(db *dynamodb.Client, table string) *QuestionDynamoRepository {
	return &QuestionDynamoRepository{db: db, tableName: table}
}

func (r *QuestionDynamoRepository) AddQuestion(question domain.Question) (string, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	if question.ID == "" {
		question.ID = uuid.New().String()
	}
	item, err := attributevalue.MarshalMap(question)
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
	return question.ID, nil
}

func (r *QuestionDynamoRepository) UpdateQuestion(id string, update domain.Question) error {
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

func (r *QuestionDynamoRepository) DeleteQuestion(id string) error {
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

// DeleteQuestions bulk-deletes questions using DynamoDB BatchWriteItem,
// chunked to the 25-request-per-call limit. It returns the ids that were
// deleted and a map of id -> error message for the ones that failed.
func (r *QuestionDynamoRepository) DeleteQuestions(ids []string) ([]string, map[string]string, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	const maxBatchSize = 25

	deleted := []string{}
	failed := map[string]string{}

	chunk := make([]types.WriteRequest, 0, maxBatchSize)
	chunkIDs := make([]string, 0, maxBatchSize)

	flush := func() {
		if len(chunk) == 0 {
			return
		}
		out, err := r.db.BatchWriteItem(ctx, &dynamodb.BatchWriteItemInput{
			RequestItems: map[string][]types.WriteRequest{
				r.tableName: chunk,
			},
		})
		if err != nil {
			for _, id := range chunkIDs {
				failed[id] = err.Error()
			}
		} else {
			unprocessed := map[string]bool{}
			for _, wr := range out.UnprocessedItems[r.tableName] {
				if wr.DeleteRequest == nil {
					continue
				}
				if av, ok := wr.DeleteRequest.Key["id"]; ok {
					if s, ok := av.(*types.AttributeValueMemberS); ok {
						unprocessed[s.Value] = true
					}
				}
			}
			for _, id := range chunkIDs {
				if unprocessed[id] {
					failed[id] = "item could not be deleted (unprocessed)"
				} else {
					deleted = append(deleted, id)
				}
			}
		}
		chunk = chunk[:0]
		chunkIDs = chunkIDs[:0]
	}

	for _, id := range ids {
		key, err := attributevalue.MarshalMap(map[string]string{"id": id})
		if err != nil {
			failed[id] = err.Error()
			continue
		}
		chunk = append(chunk, types.WriteRequest{
			DeleteRequest: &types.DeleteRequest{
				Key: key,
			},
		})
		chunkIDs = append(chunkIDs, id)
		if len(chunk) == maxBatchSize {
			flush()
		}
	}
	flush()

	return deleted, failed, nil
}

func (r *QuestionDynamoRepository) GetQuestionByID(id string) (*domain.Question, error) {
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
	var question domain.Question
	err = attributevalue.UnmarshalMap(out.Item, &question)
	if err != nil {
		return nil, err
	}
	return &question, nil
}

func (r *QuestionDynamoRepository) GetAllQuestions() ([]domain.Question, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	// Paged Scan (issue #41): the question bank is the largest table in
	// practice (long HTML content), so a single-page Scan truncates.
	items, err := scanPages(ctx, r.db, &dynamodb.ScanInput{
		TableName: &r.tableName,
	})
	if err != nil {
		return nil, err
	}

	var questions []domain.Question
	err = attributevalue.UnmarshalListOfMaps(items, &questions)
	if err != nil {
		return nil, err
	}

	return questions, nil
}

func (r *QuestionDynamoRepository) AddMultipleQuestions(questions []domain.Question) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	var writeRequests []types.WriteRequest
	for _, question := range questions {
		question.ID = strings.Join(strings.Split(uuid.NewString(), "-"), "")
		av, err := attributevalue.MarshalMap(question)
		if err != nil {
			return err
		}

		writeRequests = append(writeRequests, types.WriteRequest{
			PutRequest: &types.PutRequest{
				Item: av,
			},
		})
	}
	output, err := r.db.BatchWriteItem(ctx, &dynamodb.BatchWriteItemInput{
		RequestItems: map[string][]types.WriteRequest{
			r.tableName: writeRequests,
		},
	})

	if err != nil {
		return err
	}

	if len(output.UnprocessedItems) > 0 {
		return errors.New("some of the questions couldn't be added")
	}

	return nil
}

// GetByIDs hydrates the given question ids with BatchGetItem (100 keys per
// call, unprocessed keys retried with a small backoff) instead of scanning the
// whole table (D6). Missing ids are silently skipped; the result order is the
// order of ids (duplicates collapsed) so callers keep the contest's ordering.
func (r *QuestionDynamoRepository) GetByIDs(ids []string) ([]domain.Question, error) {
	if len(ids) == 0 {
		return []domain.Question{}, nil
	}
	seen := make(map[string]struct{}, len(ids))
	unique := make([]string, 0, len(ids))
	for _, id := range ids {
		if id == "" {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		unique = append(unique, id)
	}

	found := make(map[string]domain.Question, len(unique))
	for start := 0; start < len(unique); start += 100 {
		end := start + 100
		if end > len(unique) {
			end = len(unique)
		}
		keys := make([]map[string]types.AttributeValue, 0, end-start)
		for _, id := range unique[start:end] {
			keys = append(keys, map[string]types.AttributeValue{"id": &types.AttributeValueMemberS{Value: id}})
		}
		pending := map[string]types.KeysAndAttributes{r.tableName: {Keys: keys}}
		for attempt := 0; len(pending) > 0; attempt++ {
			if attempt > 5 {
				return nil, errors.New("question batch get: unprocessed keys after retries")
			}
			if attempt > 0 {
				time.Sleep(time.Duration(50*(1<<attempt)) * time.Millisecond)
			}
			ctx, cancel := awsconfig.CallCtx(context.Background())
			out, err := r.db.BatchGetItem(ctx, &dynamodb.BatchGetItemInput{RequestItems: pending})
			cancel()
			if err != nil {
				return nil, err
			}
			for _, item := range out.Responses[r.tableName] {
				var q domain.Question
				if err := attributevalue.UnmarshalMap(item, &q); err != nil {
					return nil, err
				}
				found[q.ID] = q
			}
			pending = out.UnprocessedKeys
		}
	}

	result := make([]domain.Question, 0, len(found))
	for _, id := range unique {
		if q, ok := found[id]; ok {
			result = append(result, q)
		}
	}
	return result, nil
}
