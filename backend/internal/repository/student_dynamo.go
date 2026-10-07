package repository

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
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

type StudentDynamoRepository struct {
	db        *dynamodb.Client
	tableName string

	// Memoized discovery of the student table's primary-key attribute names
	// (see keyAttributes / pointKeyFor). One DescribeTable is enough for the
	// repository's lifetime, so it is guarded by keyOnce.
	keyOnce  sync.Once
	keyCache []string
}

func NewStudentDynamoRepository(db *dynamodb.Client, table string) *StudentDynamoRepository {
	return &StudentDynamoRepository{db: db, tableName: table}
}

func (r *StudentDynamoRepository) AddStudent(student domain.Student) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	if student.TelegramID == "" {
		return fmt.Errorf("telegram_id is required and cannot be empty")
	}

	// Uniqueness guard (issue #31): the student table has no GSI on
	// telegram_id (see cmd/setup-tables), so a DynamoDB conditional write
	// cannot enforce it; we pre-read instead. Residual race: two concurrent
	// AddStudent calls for the same telegram_id can both pass this check and
	// both PutItem, because each row gets its own uuid primary key.
	existing, err := r.GetStudentByTelegramID(student.TelegramID)
	if err != nil {
		return err
	}
	if existing != nil {
		return fmt.Errorf("%w: student %s", usecase.ErrStudentAlreadyExists, existing.ID)
	}

	if student.ID == "" {
		student.ID = uuid.New().String()
	}

	// Set CreatedAt timestamp if not already set
	if student.CreatedAt.IsZero() {
		student.CreatedAt = time.Now()
	}

	item, err := attributevalue.MarshalMap(student)
	if err != nil {
		return err
	}

	_, err = r.db.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: &r.tableName,
		Item:      item,
	})
	return err
}

// UpdateStudent patches only the non-zero fields of the given student via
// UpdateItem/UpdateExpression instead of the old whole-item PutItem read-
// modify-write (issue #31), so a stale read in one writer can no longer wipe
// attributes another writer just changed. Zero values (empty strings, false
// bools, empty lists/maps, nil/zero created_at) are treated as "not provided"
// and left untouched — a field cannot be cleared through this path, only
// overwritten with a real value. updated_at is stamped RFC3339 on every write;
// it is an audit-only attribute outside domain.Student (unmarshal ignores it).
func (r *StudentDynamoRepository) UpdateStudent(student domain.Student) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	if student.ID == "" {
		return fmt.Errorf("student id is required and cannot be empty")
	}

	item, err := attributevalue.MarshalMap(student)
	if err != nil {
		return err
	}
	if student.CreatedAt.IsZero() {
		delete(item, "created_at") // do not clobber the real creation time
	}

	attrs := make([]string, 0, len(item))
	for name, av := range item {
		if name == "id" || isZeroAttributeValue(av) {
			continue
		}
		attrs = append(attrs, name)
	}
	sort.Strings(attrs) // deterministic expression for logging/tests

	names := map[string]string{"#updated_at": "updated_at"}
	values := map[string]types.AttributeValue{
		":updated_at": &types.AttributeValueMemberS{Value: time.Now().UTC().Format(time.RFC3339)},
	}
	parts := []string{"#updated_at = :updated_at"}
	for i, name := range attrs {
		n := fmt.Sprintf("#a%d", i)
		v := fmt.Sprintf(":v%d", i)
		names[n] = name
		values[v] = item[name]
		parts = append(parts, n+" = "+v)
	}

	// Build the point-operation key from the table's real key schema, not a
	// hardcoded {id}: UpdateItem requires the table's COMPLETE primary key, and
	// the live student table's key is discovered here so a composite or
	// non-"id" key no longer trips "key element does not match the schema".
	key, err := r.fullKeyFor(ctx, student.ID, student.TelegramID)
	if err != nil {
		return err
	}
	if key == nil {
		return fmt.Errorf("student %s not found in %s table", student.ID, r.tableName)
	}
	_, err = r.db.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                 &r.tableName,
		Key:                       key,
		UpdateExpression:          aws.String("SET " + strings.Join(parts, ", ")),
		ExpressionAttributeNames:  names,
		ExpressionAttributeValues: values,
	})
	return err
}

// isZeroAttributeValue reports whether a marshalled attribute carries only
// the Go zero value of the corresponding domain.Student field, i.e. the
// caller did not meaningfully provide it.
func isZeroAttributeValue(av types.AttributeValue) bool {
	switch v := av.(type) {
	case *types.AttributeValueMemberS:
		return v.Value == ""
	case *types.AttributeValueMemberNULL:
		return true
	case *types.AttributeValueMemberBOOL:
		return !v.Value
	case *types.AttributeValueMemberL:
		return len(v.Value) == 0
	case *types.AttributeValueMemberM:
		return len(v.Value) == 0
	default:
		return false
	}
}

// UpdateStudentIfExist writes the student only while the row still exists
// (ConditionExpression attribute_exists(id)). It is the safe counterpart to the
// read-modify-write in the badge flow: it refuses to resurrect a row a concurrent
// delete removed. A ConditionalCheckFailedException is mapped to
// usecase.ErrConditionalCheckFailed so the caller can re-read and retry once.
func (r *StudentDynamoRepository) UpdateStudentIfExist(student domain.Student) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	item, err := attributevalue.MarshalMap(student)
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
			return fmt.Errorf("%w: student %s", usecase.ErrConditionalCheckFailed, student.ID)
		}
		return err
	}
	return nil
}

func (r *StudentDynamoRepository) GetStudentByID(id string) (*domain.Student, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()

	out, err := r.db.Query(ctx, &dynamodb.QueryInput{
		TableName:              &r.tableName,
		KeyConditionExpression: aws.String("id = :id"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":id": &types.AttributeValueMemberS{Value: id},
		},
	})
	if err != nil {
		return nil, err
	}
	if len(out.Items) == 0 {
		return nil, nil // Student not found
	}

	var student domain.Student
	err = attributevalue.UnmarshalMap(out.Items[0], &student)
	if err != nil {
		return nil, err
	}
	return &student, nil
}

func (r *StudentDynamoRepository) GetStudentByTelegramID(telegramID string) (*domain.Student, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	teleIDVal, _ := attributevalue.Marshal(telegramID)
	// Paged Scan (issue #41): with a filter there is no key guarantee, so
	// the student's row can live on any page; first match wins (the
	// uniqueness guard in AddStudent keeps at most one).
	items, err := scanPages(ctx, r.db, &dynamodb.ScanInput{
		TableName:        &r.tableName,
		FilterExpression: aws.String("telegram_id = :tele_id"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":tele_id": teleIDVal,
		},
	})
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, nil // Student not found
	}

	var student domain.Student
	err = attributevalue.UnmarshalMap(items[0], &student)
	if err != nil {
		return nil, err
	}
	return &student, nil
}

func (r *StudentDynamoRepository) GetStudents() ([]domain.Student, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	// Paged Scan (issue #41).
	items, err := scanPages(ctx, r.db, &dynamodb.ScanInput{
		TableName: &r.tableName,
	})
	if err != nil {
		return nil, err
	}
	var students []domain.Student
	err = attributevalue.UnmarshalListOfMaps(items, &students)
	if err != nil {
		return nil, err
	}
	return students, nil
}
func (r *StudentDynamoRepository) GetStructuredStudents() (map[string]domain.Student, error) {
	structured := make(map[string]domain.Student)
	students, err := r.GetStudents()
	if err != nil {
		return nil, err
	}
	for _, stud := range students {
		structured[stud.ID] = stud
	}
	return structured, nil
}

// VerifyStudentPaid reports whether the student with this telegram id has an
// approved (premium) subscription. The student table has no GSI (see
// cmd/setup-tables), so this is a Scan with a filter on the real boolean
// attribute `is_premium`. The previous Query had no KeyConditionExpression and
// filtered on a nonexistent `paid` attribute, so it always failed with a
// ValidationException (issue #20).
func (r *StudentDynamoRepository) VerifyStudentPaid(telegramID string) (bool, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	teleIDVal, _ := attributevalue.Marshal(telegramID)
	premiumVal, _ := attributevalue.Marshal(true)
	// Paged Scan (issue #41): the matching premium row can live past the
	// first page, so the whole table must be examined before answering
	// false.
	items, err := scanPages(ctx, r.db, &dynamodb.ScanInput{
		TableName:        &r.tableName,
		FilterExpression: aws.String("telegram_id = :tele_id AND is_premium = :premium"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":tele_id": teleIDVal,
			":premium": premiumVal,
		},
	})
	if err != nil {
		return false, err
	}
	return len(items) > 0, nil
}

// GetPaidStudents returns students whose subscription is active, i.e. the
// `is_premium` attribute (the domain Student's paid flag, dynamodbav:"is_premium")
// is true. Scan + FilterExpression is used because the student table defines no
// GSI on is_premium (see cmd/setup-tables); acceptable at this scale.
func (r *StudentDynamoRepository) GetPaidStudents() ([]domain.Student, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	premiumVal, _ := attributevalue.Marshal(true)
	// Paged Scan (issue #41).
	items, err := scanPages(ctx, r.db, &dynamodb.ScanInput{
		TableName:        &r.tableName,
		FilterExpression: aws.String("is_premium = :premium"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":premium": premiumVal,
		},
	})
	if err != nil {
		return nil, err
	}
	var students []domain.Student
	err = attributevalue.UnmarshalListOfMaps(items, &students)
	if err != nil {
		return nil, err
	}
	return students, nil
}

func (r *StudentDynamoRepository) GetGradesAndSchools() (map[string][]string, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	// Paged Scan (issue #41): the aggregation must see every student row,
	// not just the first page.
	items, err := scanPages(ctx, r.db, &dynamodb.ScanInput{
		TableName:            &r.tableName,
		ProjectionExpression: aws.String("grade, school"),
	})
	if err != nil {
		return nil, err
	}
	gradesSet := make(map[string]struct{})
	schoolsSet := make(map[string]struct{})
	for _, item := range items {
		var student domain.Student
		err := attributevalue.UnmarshalMap(item, &student)
		if err != nil {
			continue
		}
		if student.Grade != "" {
			gradesSet[student.Grade] = struct{}{}
		}
		if student.School != "" {
			schoolsSet[student.School] = struct{}{}
		}
	}
	grades := make([]string, 0, len(gradesSet))
	schools := make([]string, 0, len(schoolsSet))
	for g := range gradesSet {
		grades = append(grades, g)
	}
	for s := range schoolsSet {
		schools = append(schools, s)
	}
	return map[string][]string{"grades": grades, "schools": schools}, nil
}

func (r *StudentDynamoRepository) GetUserProfile(studentID string) (map[string]interface{}, error) {
	student, err := r.GetStudentByID(studentID)
	if err != nil || student == nil {
		return nil, err
	}
	profile := map[string]interface{}{
		"id":          student.ID,
		"telegram_id": student.TelegramID,
		"name":        student.Name,
		"age":         student.Age,
		"grade":       student.Grade,
		"school":      student.School,
		"city":        student.City,
		"region":      student.Region,
		"imgurl":      student.ImgURL,
		"isSuspended": student.IsSuspended,
		"badge":       student.Badge,
		"is_premium":  student.IsPremium,
	}
	return profile, nil
}

// GetQuickStat / GetStudentRankings / GetStudentRankingsByContest used to live
// here returning hardcoded placeholders and nil stubs (README §9 #48). The
// aggregation spans the submission, contest and payment tables, so it now
// lives in the student usecase (internal/usecase/student_usecase.go), which
// already receives those repositories.

// SetSuspended forces isSuspended to the given value on the student's row.
// Unlike UpdateStudent (which skips zero-valued fields and therefore cannot
// clear a suspension), this writes the flag explicitly in both directions so
// the admin suspend/reactivate lifecycle works. The write key is resolved via
// fullKeyFor so a composite-key table is not broken by a partial {id} key.
func (r *StudentDynamoRepository) SetSuspended(id string, suspended bool) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	if id == "" {
		return fmt.Errorf("student id is required and cannot be empty")
	}

	// In this system the student's id equals its telegram id, so id serves as
	// both the partition-key lookup and the scan-fallback attribute.
	key, err := r.fullKeyFor(ctx, id, id)
	if err != nil {
		return err
	}
	if key == nil {
		return fmt.Errorf("student %s not found in %s table", id, r.tableName)
	}

	susp, err := attributevalue.Marshal(suspended)
	if err != nil {
		return err
	}
	names := map[string]string{"#susp": "isSuspended", "#updated_at": "updated_at"}
	values := map[string]types.AttributeValue{
		":susp":       susp,
		":updated_at": &types.AttributeValueMemberS{Value: time.Now().UTC().Format(time.RFC3339)},
	}
	_, err = r.db.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                 &r.tableName,
		Key:                       key,
		UpdateExpression:          aws.String("SET #susp = :susp, #updated_at = :updated_at"),
		ExpressionAttributeNames:  names,
		ExpressionAttributeValues: values,
	})
	return err
}

func (r *StudentDynamoRepository) DeleteStudent(id string) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	// Resolve the table's COMPLETE primary key for this row (see fullKeyFor).
	// Deleting a missing item is a no-op in DynamoDB, so answer success when
	// the row cannot be located to keep callers' delete-then-move-on intact.
	key, err := r.fullKeyFor(ctx, id, id)
	if err != nil {
		return err
	}
	if key == nil {
		return nil
	}
	_, err = r.db.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: &r.tableName,
		Key:       key,
	})
	return err
}

// keyAttributes memoizes the student table's key attribute names, discovered
// once via DescribeTable. Point operations need the table's COMPLETE primary
// key, and the live student table is not always provisioned with a plain "id"
// hash key — some environments key it on telegram_id or a composite key, which
// a hardcoded {id} key no longer satisfies.
func (r *StudentDynamoRepository) keyAttributes(ctx context.Context) []string {
	r.keyOnce.Do(func() {
		r.keyCache = r.describeKeyAttributes(ctx)
	})
	return r.keyCache
}

func (r *StudentDynamoRepository) describeKeyAttributes(ctx context.Context) []string {
	out, err := r.db.DescribeTable(ctx, &dynamodb.DescribeTableInput{
		TableName: &r.tableName,
	})
	if err != nil {
		// On failure fall back to the code's assumed key, but surface it in the
		// server log so a key-mismatch (which would otherwise 400 on every
		// write) is diagnosable.
		log.Printf("student table %s: DescribeTable failed, assuming key [id]: %v", r.tableName, err)
		return []string{"id"}
	}
	var names []string
	for _, k := range out.Table.KeySchema {
		names = append(names, aws.ToString(k.AttributeName))
	}
	if len(names) == 0 {
		log.Printf("student table %s: empty key schema, assuming [id]", r.tableName)
		return []string{"id"}
	}
	return names
}

// fullKeyFor builds the table's COMPLETE primary key for the student row
// identified by (id, telegramID). For a plain "id"-only key it is the same
// {id} map the code always used (a no-op). For a composite or non-"id" key it
// lifts every key attribute from the stored row's RAW item (not a domain
// round-trip, which can change a range key's attribute type) so a write only
// ever targets the row it describes. A nil key with a nil error means the row
// does not exist yet (relevant to updates on a brand-new identity, where the
// partition key is still resolvable but there is no range-key row to lift).
func (r *StudentDynamoRepository) fullKeyFor(ctx context.Context, id, telegramID string) (map[string]types.AttributeValue, error) {
	names := r.keyAttributes(ctx)
	if len(names) == 1 && strings.EqualFold(names[0], "id") {
		key, err := attributevalue.MarshalMap(map[string]string{"id": id})
		if err != nil {
			return nil, err
		}
		return key, nil
	}

	// Non-"id" key: pull the key attributes from the stored row's RAW item.
	raw, err := r.storedItem(ctx, id, telegramID)
	if err != nil {
		return nil, err
	}
	if raw == nil {
		return nil, nil
	}
	key := make(map[string]types.AttributeValue, len(names))
	for _, n := range names {
		av, ok := raw[n]
		if !ok {
			return nil, fmt.Errorf("student row %s missing key attribute %q", id, n)
		}
		key[n] = av
	}
	return key, nil
}

// storedItem returns the raw DynamoDB item for a student row, or nil when the
// row is absent. It is the faithful source of key values: the stored item
// carries every key attribute in its original type. It works for either live
// key layout — a partition key of "id" (a Query on id) or a different one such
// as telegram_id (a paged Scan on the real unique attribute, mirroring
// GetStudentByTelegramID) — so a composite-key table can still be located and
// its full key reconstructed.
func (r *StudentDynamoRepository) storedItem(ctx context.Context, id, telegramID string) (map[string]types.AttributeValue, error) {
	// Fast path: the table is partitioned on "id", so a Query by id is valid.
	if id != "" {
		out, err := r.db.Query(ctx, &dynamodb.QueryInput{
			TableName:              &r.tableName,
			KeyConditionExpression: aws.String("id = :id"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":id": &types.AttributeValueMemberS{Value: id},
			},
		})
		if err == nil {
			if len(out.Items) == 0 {
				return nil, nil
			}
			return out.Items[0], nil
		}
		// Query by "id" fails when the partition key is not "id". The row may
		// still exist under a telegram_id key, so fall through to the Scan.
	}
	if telegramID == "" {
		return nil, nil
	}

	// Slow path: locate the row by telegram_id via a paged Scan (the student
	// table has no GSI on telegram_id, so this mirrors GetStudentByTelegramID).
	teleVal, _ := attributevalue.Marshal(telegramID)
	items, err := scanPages(ctx, r.db, &dynamodb.ScanInput{
		TableName:        &r.tableName,
		FilterExpression: aws.String("telegram_id = :tele_id"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":tele_id": teleVal,
		},
	})
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, nil
	}
	return items[0], nil
}
