package repository

import (
	"context"
	"strconv"

	"victory-contest-go/internal/awsconfig"
	"victory-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const leaderboardIndex = "board_key-rank_key-index"

// LeaderboardDynamoRepository stores precomputed boards (plan §5.5).
type LeaderboardDynamoRepository struct {
	db    *dynamodb.Client
	table string
}

func NewLeaderboardDynamoRepository(db *dynamodb.Client, table string) *LeaderboardDynamoRepository {
	return &LeaderboardDynamoRepository{db: db, table: table}
}

// PutRows writes rows with BatchWriteItem (25 per call, unprocessed items retried a few times).
func (r *LeaderboardDynamoRepository) PutRows(rows []domain.BoardRow) error {
	for i := 0; i < len(rows); i += 25 {
		end := i + 25
		if end > len(rows) {
			end = len(rows)
		}
		var reqs []types.WriteRequest
		for _, row := range rows[i:end] {
			item, err := attributevalue.MarshalMap(row)
			if err != nil {
				return err
			}
			reqs = append(reqs, types.WriteRequest{PutRequest: &types.PutRequest{Item: item}})
		}
		pending := map[string][]types.WriteRequest{r.table: reqs}
		for try := 0; try < 4 && len(pending) > 0; try++ {
			ctx, cancel := awsconfig.CallCtx(context.Background())
			out, err := r.db.BatchWriteItem(ctx, &dynamodb.BatchWriteItemInput{RequestItems: pending})
			cancel()
			if err != nil {
				return err
			}
			pending = out.UnprocessedItems
		}
	}
	return nil
}

// DeleteRow removes one row (used when an exclusion empties a student's board entry).
func (r *LeaderboardDynamoRepository) DeleteRow(id string) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	_, err := r.db.DeleteItem(ctx, &dynamodb.DeleteItemInput{TableName: aws.String(r.table), Key: idKey(id)})
	return err
}

// Top returns up to n rows of a board, best first.
func (r *LeaderboardDynamoRepository) Top(boardKey string, n int) ([]domain.BoardRow, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	out, err := r.db.Query(ctx, &dynamodb.QueryInput{
		TableName:                 aws.String(r.table),
		IndexName:                 aws.String(leaderboardIndex),
		KeyConditionExpression:    aws.String("board_key = :b"),
		ExpressionAttributeValues: map[string]types.AttributeValue{":b": &types.AttributeValueMemberS{Value: boardKey}},
		ScanIndexForward:          aws.Bool(false),
		Limit:                     aws.Int32(int32(n)),
	})
	if err != nil {
		return nil, err
	}
	var rows []domain.BoardRow
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &rows); err != nil {
		return nil, err
	}
	return rows, nil
}

// Get returns one student's row on a board (nil when absent).
func (r *LeaderboardDynamoRepository) Get(boardKey, studentID string) (*domain.BoardRow, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	out, err := r.db.GetItem(ctx, &dynamodb.GetItemInput{TableName: aws.String(r.table), Key: idKey(boardKey + "#" + studentID)})
	if err != nil || len(out.Item) == 0 {
		return nil, err
	}
	var row domain.BoardRow
	if err := attributevalue.UnmarshalMap(out.Item, &row); err != nil {
		return nil, err
	}
	return &row, nil
}

// CountAbove counts rows on a board with rank_key greater than the given key (rank = count + 1).
func (r *LeaderboardDynamoRepository) CountAbove(boardKey string, rankKey int64) (int, error) {
	total := 0
	var start map[string]types.AttributeValue
	for {
		ctx, cancel := awsconfig.CallCtx(context.Background())
		out, err := r.db.Query(ctx, &dynamodb.QueryInput{
			TableName:              aws.String(r.table),
			IndexName:              aws.String(leaderboardIndex),
			KeyConditionExpression: aws.String("board_key = :b AND rank_key > :k"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":b": &types.AttributeValueMemberS{Value: boardKey},
				":k": &types.AttributeValueMemberN{Value: strconv.FormatInt(rankKey, 10)},
			},
			Select:            types.SelectCount,
			ExclusiveStartKey: start,
		})
		cancel()
		if err != nil {
			return 0, err
		}
		total += int(out.Count)
		if len(out.LastEvaluatedKey) == 0 {
			return total, nil
		}
		start = out.LastEvaluatedKey
	}
}
