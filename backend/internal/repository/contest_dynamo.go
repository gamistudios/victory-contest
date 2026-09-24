package repository

import (
	"context"
	"fmt"
	"reflect"
	"strings"
	"victor-contest-go/internal/awsconfig"
	"victor-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"
)

type ContestDynamoRepository struct {
	db        *dynamodb.Client
	tableName string
}

func NewContestDynamoRepository(db *dynamodb.Client, table string) *ContestDynamoRepository {
	return &ContestDynamoRepository{db: db, tableName: table}
}

func (r *ContestDynamoRepository) AddContest(contest domain.Contest) (string, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	if contest.ID == "" {
		contest.ID = uuid.New().String()
	}
	item, err := attributevalue.MarshalMap(contest)
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
	return contest.ID, nil
}

func (r *ContestDynamoRepository) GetAllContests() ([]domain.Contest, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	// Paged Scan (issue #41).
	items, err := scanPages(ctx, r.db, &dynamodb.ScanInput{
		TableName: &r.tableName,
	})
	if err != nil {
		return nil, err
	}
	var contests []domain.Contest
	err = attributevalue.UnmarshalListOfMaps(items, &contests)
	if err != nil {
		return nil, err
	}
	return contests, nil
}

// GetContestByID loads a contest. The questions attribute is decoded through
// attributevalue, which accepts both the "L" list written from now on (#42) and
// legacy "SS" string-set rows written by the old update path, so already stored
// data stays readable.
func (r *ContestDynamoRepository) GetContestByID(id string) (*domain.Contest, error) {
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

	var contest domain.Contest
	err = attributevalue.UnmarshalMap(out.Item, &contest)
	if err != nil {
		return nil, err
	}

	return &contest, nil
}

func (r *ContestDynamoRepository) UpdateContest(id string, update domain.Contest) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	// First, get the current contest to preserve existing fields
	currentContest, err := r.GetContestByID(id)
	if err != nil {
		return err
	}
	if currentContest == nil {
		return fmt.Errorf("contest not found")
	}

	// Use UpdateItem for more efficient partial updates
	updateExpression := "SET "
	var expressionAttributeNames map[string]string
	var expressionAttributeValues map[string]types.AttributeValue

	// Build update expression dynamically based on provided fields
	var updateParts []string
	expressionAttributeNames = make(map[string]string)
	expressionAttributeValues = make(map[string]types.AttributeValue)

	// Helper function to add field to update
	addFieldToUpdate := func(fieldName, jsonName string) {
		if fieldValue := reflect.ValueOf(update).FieldByName(fieldName).String(); fieldValue != "" {
			updateParts = append(updateParts, "#"+jsonName+" = :"+jsonName)
			expressionAttributeNames["#"+jsonName] = jsonName
			expressionAttributeValues[":"+jsonName] = &types.AttributeValueMemberS{Value: fieldValue}
		}
	}

	// Add each field if it has a value
	addFieldToUpdate("Title", "title")
	addFieldToUpdate("Description", "description")
	addFieldToUpdate("StartTime", "start_time")
	addFieldToUpdate("EndTime", "end_time")
	addFieldToUpdate("Subject", "subject")
	addFieldToUpdate("Grade", "grade")
	addFieldToUpdate("Prize", "prize")
	addFieldToUpdate("Status", "status")
	addFieldToUpdate("Type", "type")
	updateParts = append(updateParts, "#questions = :questions")
	expressionAttributeNames["#questions"] = "questions"

	// The questions attribute must have ONE DynamoDB type. AddContest marshals
	// []string as "L" (ordered list), so the update path has to write "L" too;
	// it used to write "SS", which reordered/deduped the ids and made readers
	// see two different shapes for the same attribute (#42).
	//
	// The list on the update request is authoritative; an empty/absent list never
	// wipes stored questions (callers merge the current value first).
	questions := update.Questions
	if len(questions) == 0 {
		questions = currentContest.Questions
	}
	questionMembers := make([]types.AttributeValue, 0, len(questions))
	for _, q := range questions {
		questionMembers = append(questionMembers, &types.AttributeValueMemberS{Value: q})
	}
	expressionAttributeValues[":questions"] = &types.AttributeValueMemberL{Value: questionMembers}

	// Build the final update expression
	updateExpression += strings.Join(updateParts, ", ")
	// Create the key for the item to update
	key, err := attributevalue.MarshalMap(map[string]string{"id": id})
	if err != nil {
		return err
	}

	// Perform the update
	_, err = r.db.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                 &r.tableName,
		Key:                       key,
		UpdateExpression:          &updateExpression,
		ExpressionAttributeNames:  expressionAttributeNames,
		ExpressionAttributeValues: expressionAttributeValues,
	})

	return err
}

func (r *ContestDynamoRepository) DeleteContest(id string) error {
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
