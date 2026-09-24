package repository

import (
	"context"
	"errors"
	"fmt"
	"time"
	"victor-contest-go/internal/awsconfig"
	"victor-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"
)

type FeedbackResponseDynamoRepository struct {
	db        *dynamodb.Client
	tableName string
}

func NewFeedbackResponseDynamoRepository(db *dynamodb.Client, table string) *FeedbackResponseDynamoRepository {
	return &FeedbackResponseDynamoRepository{db: db, tableName: table}
}

func (r *FeedbackResponseDynamoRepository) AddFeedbackResponse(response domain.FeedbackResponse) (string, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	if response.ID == "" {
		response.ID = uuid.New().String()
	}
	item, err := attributevalue.MarshalMap(response)
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
	return response.ID, nil
}

func (r *FeedbackResponseDynamoRepository) UpdateFeedbackResponse(id string, update domain.FeedbackResponse) error {
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

func (r *FeedbackResponseDynamoRepository) DeleteFeedbackResponse(id string) error {
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

func (r *FeedbackResponseDynamoRepository) DeleteFeedbackResponseOnly(id string) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	// First, get the response to check if it has contact info
	response, err := r.GetFeedbackResponseByID(id)
	if err != nil {
		return err
	}
	if response == nil {
		return fmt.Errorf("response not found")
	}

	// If the response has contact info, preserve it by creating a new response
	// with only the contact info and deleting the original
	if response.ContactInfo != nil {
		// Create a new response with only contact info
		contactOnlyResponse := domain.FeedbackResponse{
			ID:          response.ID,
			StudentID:   response.StudentID,
			StudentName: response.StudentName,
			ContactInfo: response.ContactInfo,
			SubmittedAt: response.SubmittedAt,
		}

		// Save the contact-only response
		item, err := attributevalue.MarshalMap(contactOnlyResponse)
		if err != nil {
			return err
		}
		_, err = r.db.PutItem(ctx, &dynamodb.PutItemInput{
			TableName: &r.tableName,
			Item:      item,
		})
		return err
	} else {
		// If no contact info, just delete the entire response
		return r.DeleteFeedbackResponse(id)
	}
}

func (r *FeedbackResponseDynamoRepository) GetFeedbackResponseByID(id string) (*domain.FeedbackResponse, error) {
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
	var response domain.FeedbackResponse
	err = attributevalue.UnmarshalMap(out.Item, &response)
	if err != nil {
		return nil, err
	}
	return &response, nil
}

func (r *FeedbackResponseDynamoRepository) GetAllFeedbackResponses() ([]domain.FeedbackResponse, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	// Paged Scan (issue #41). GetFeedbackAnalytics and
	// DeleteContactByPhoneNumber build on this, so they inherit the fix.
	items, err := scanPages(ctx, r.db, &dynamodb.ScanInput{
		TableName: &r.tableName,
	})
	if err != nil {
		return nil, err
	}
	var responses []domain.FeedbackResponse
	err = attributevalue.UnmarshalListOfMaps(items, &responses)
	if err != nil {
		return nil, err
	}
	return responses, nil
}

func (r *FeedbackResponseDynamoRepository) GetFeedbackResponsesByStudent(studentID string) ([]domain.FeedbackResponse, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	studentIDVal, _ := attributevalue.Marshal(studentID)
	// Paged Scan (issue #41): filtered matches can live past the first page.
	items, err := scanPages(ctx, r.db, &dynamodb.ScanInput{
		TableName:        &r.tableName,
		FilterExpression: aws.String("student_id = :student_id"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":student_id": studentIDVal,
		},
	})
	if err != nil {
		return nil, err
	}
	var responses []domain.FeedbackResponse
	err = attributevalue.UnmarshalListOfMaps(items, &responses)
	if err != nil {
		return nil, err
	}
	return responses, nil
}

func (r *FeedbackResponseDynamoRepository) GetFeedbackResponsesByQuestion(questionID string) ([]domain.FeedbackResponse, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	// This is a more complex query since question_responses is a map
	// We'll need to scan and filter in application code
	// Paged Scan (issue #41).
	items, err := scanPages(ctx, r.db, &dynamodb.ScanInput{
		TableName: &r.tableName,
	})
	if err != nil {
		return nil, err
	}
	var allResponses []domain.FeedbackResponse
	err = attributevalue.UnmarshalListOfMaps(items, &allResponses)
	if err != nil {
		return nil, err
	}

	// Filter responses that contain the specific question
	var filteredResponses []domain.FeedbackResponse
	for _, response := range allResponses {
		if _, exists := response.QuestionResponses[questionID]; exists {
			filteredResponses = append(filteredResponses, response)
		}
	}
	return filteredResponses, nil
}

func (r *FeedbackResponseDynamoRepository) GetFeedbackAnalytics(filter domain.AnalyticsFilter) (*domain.AnalyticsData, error) {
	// Get all feedback responses
	responses, err := r.GetAllFeedbackResponses()
	if err != nil {
		return nil, err
	}

	// Apply time filter if specified
	if filter.TimeRange != "all" {
		responses = r.filterByTimeRange(responses, filter.TimeRange)
	}

	// Calculate analytics
	analytics := &domain.AnalyticsData{
		TotalResponses: len(responses),
		QuestionStats:  r.calculateQuestionStats(responses),
		PollStats:      r.calculatePollStats(responses),
		ContactList:    r.getContactList(responses),
		CommentSummary: r.calculateCommentSummary(responses),
	}

	return analytics, nil
}

// DeleteContactByPhoneNumber clears the contact info of EVERY response that
// carries the given phone number. The old version had a `return` inside the
// scan loop (only the first match was ever cleared) and rewrote the whole
// item via PutItem (lost-update: concurrent edits to other attributes were
// clobbered). Each match is now updated with a targeted UpdateItem that
// touches only contact_info and is conditioned on the stored phone number
// still matching, so a concurrently rewritten or deleted contact is never
// resurrected. Errors on individual items do not stop the sweep; the first
// error is returned after all items were attempted.
func (r *FeedbackResponseDynamoRepository) DeleteContactByPhoneNumber(phoneNumber string) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	responses, err := r.GetAllFeedbackResponses()
	if err != nil {
		return err
	}

	var firstErr error
	for _, response := range responses {
		if response.ContactInfo == nil || response.ContactInfo.PhoneNumber != phoneNumber {
			continue
		}
		key, err := attributevalue.MarshalMap(map[string]string{"id": response.ID})
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		phoneVal, err := attributevalue.Marshal(phoneNumber)
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		_, err = r.db.UpdateItem(ctx, &dynamodb.UpdateItemInput{
			TableName:           &r.tableName,
			Key:                 key,
			UpdateExpression:    aws.String("REMOVE contact_info"),
			ConditionExpression: aws.String("attribute_exists(id) AND contact_info.phone_number = :phone"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":phone": phoneVal,
			},
		})
		if err != nil {
			// Row vanished or its contact was changed concurrently: the goal
			// (no contact with this phone on that row) already holds — skip.
			var ccf *types.ConditionalCheckFailedException
			if errors.As(err, &ccf) {
				continue
			}
			if firstErr == nil {
				firstErr = err
			}
		}
	}

	return firstErr // nil when nothing matched: contact considered already deleted
}

// Helper methods for analytics calculations
func (r *FeedbackResponseDynamoRepository) filterByTimeRange(responses []domain.FeedbackResponse, timeRange string) []domain.FeedbackResponse {
	now := time.Now()
	var filtered []domain.FeedbackResponse

	for _, response := range responses {
		var cutoff time.Time
		switch timeRange {
		case "7d":
			cutoff = now.AddDate(0, 0, -7)
		case "30d":
			cutoff = now.AddDate(0, 0, -30)
		case "90d":
			cutoff = now.AddDate(0, 0, -90)
		default:
			return responses // Return all if invalid time range
		}

		if response.SubmittedAt.After(cutoff) {
			filtered = append(filtered, response)
		}
	}

	return filtered
}

func (r *FeedbackResponseDynamoRepository) calculateQuestionStats(responses []domain.FeedbackResponse) []domain.QuestionStat {
	questionStats := make(map[string]map[string]int)
	questionTexts := make(map[string]string)

	// Collect all question responses
	for _, response := range responses {
		for questionID, questionResponse := range response.QuestionResponses {
			if questionStats[questionID] == nil {
				questionStats[questionID] = make(map[string]int)
			}
			questionStats[questionID][questionResponse.SelectedOption]++
			// Store question text (we'll need to get this from the question repository)
			questionTexts[questionID] = questionResponse.SelectedOption // This is a placeholder
		}
	}

	// Convert to slice
	var stats []domain.QuestionStat
	for questionID, responses := range questionStats {
		stats = append(stats, domain.QuestionStat{
			QuestionID: questionID,
			Question:   questionTexts[questionID], // This should be the actual question text
			Responses:  responses,
		})
	}

	return stats
}

func (r *FeedbackResponseDynamoRepository) calculatePollStats(responses []domain.FeedbackResponse) []domain.PollStat {
	pollCounts := make(map[string]int)
	totalResponses := len(responses)

	// Count poll responses
	for _, response := range responses {
		if response.PollResponse != "" {
			pollCounts[response.PollResponse]++
		}
	}

	// Convert to slice with percentages
	var stats []domain.PollStat
	for option, count := range pollCounts {
		percentage := 0.0
		if totalResponses > 0 {
			percentage = float64(count) / float64(totalResponses) * 100
		}
		stats = append(stats, domain.PollStat{
			OptionID:   option, // Using option as ID for now
			Option:     option,
			Count:      count,
			Percentage: percentage,
		})
	}

	return stats
}

func (r *FeedbackResponseDynamoRepository) getContactList(responses []domain.FeedbackResponse) []domain.ContactListItem {
	var contacts []domain.ContactListItem

	for _, response := range responses {
		if response.ContactInfo != nil {
			contacts = append(contacts, domain.ContactListItem{
				Name:        response.StudentName,
				Score:       response.ContactInfo.Score,
				PhoneNumber: response.ContactInfo.PhoneNumber,
				SubmittedAt: response.SubmittedAt,
			})
		}
	}

	return contacts
}

func (r *FeedbackResponseDynamoRepository) calculateCommentSummary(responses []domain.FeedbackResponse) domain.CommentSummary {
	totalComments := 0
	totalLength := 0

	for _, response := range responses {
		if response.Comment != "" {
			totalComments++
			totalLength += len(response.Comment)
		}
	}

	averageLength := 0.0
	if totalComments > 0 {
		averageLength = float64(totalLength) / float64(totalComments)
	}

	return domain.CommentSummary{
		TotalComments: totalComments,
		AverageLength: averageLength,
	}
}
