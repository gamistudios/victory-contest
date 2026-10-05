package schema

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// GSI describes one global secondary index the repositories query.
type GSI struct {
	Name      string
	Partition string
	Sort      string // "" = partition key only
	PartType  types.ScalarAttributeType
	SortType  types.ScalarAttributeType
}

// Table is one DynamoDB table the application owns: a name, a plain "id"
// partition key, and its GSIs.
type Table struct {
	Name string
	GSIs []GSI
}

// Tables mirrors every table name and index used in internal/repository (the
// repository constructors hardcode the same names in router.go — keep the two
// in sync when adding a table).
var Tables = []Table{
	{Name: "question"},
	{Name: "contests"},
	{Name: "student"},
	{Name: "admin", GSIs: []GSI{
		{Name: "email-id-index", Partition: "email", PartType: types.ScalarAttributeTypeS},
	}},
	{Name: "notification", GSIs: []GSI{
		{Name: "recipient_id-index", Partition: "recipient_id", PartType: types.ScalarAttributeTypeS},
	}},
	{Name: "achievement"},
	{Name: "banks"},
	{Name: "contest_registeration", GSIs: []GSI{
		{Name: "contest_id-student_id-index", Partition: "contest_id", Sort: "student_id",
			PartType: types.ScalarAttributeTypeS, SortType: types.ScalarAttributeTypeS},
	}},
	{Name: "payment", GSIs: []GSI{
		{Name: "GSI1PK-user_id-index", Partition: "GSI1PK", Sort: "user_id",
			PartType: types.ScalarAttributeTypeS, SortType: types.ScalarAttributeTypeS},
		{Name: "GSI1PK-status-index", Partition: "GSI1PK", Sort: "status",
			PartType: types.ScalarAttributeTypeS, SortType: types.ScalarAttributeTypeS},
		{Name: "GSI1PK-expirationDate-index", Partition: "GSI1PK", Sort: "expirationDate",
			PartType: types.ScalarAttributeTypeS, SortType: types.ScalarAttributeTypeS},
	}},
	{Name: "pageviews", GSIs: []GSI{
		{Name: "user_id-index", Partition: "user_id", PartType: types.ScalarAttributeTypeS},
	}},
	{Name: "articles", GSIs: []GSI{
		{Name: "status-index", Partition: "status", PartType: types.ScalarAttributeTypeS},
	}},
	{Name: "comments", GSIs: []GSI{
		{Name: "articleId-index", Partition: "articleId", Sort: "createdAt",
			PartType: types.ScalarAttributeTypeS, SortType: types.ScalarAttributeTypeS},
	}},
	{Name: "feedback_questions"},
	{Name: "poll_options"},
	{Name: "feedback_responses"},
	{Name: "ai_providers"},
	{Name: "ai_settings"},
	{Name: "payment_settings"},
	{Name: "submissions", GSIs: []GSI{
		{Name: "contest_id-index", Partition: "contest_id", PartType: types.ScalarAttributeTypeS},
		{Name: "student_id-index", Partition: "student_id", PartType: types.ScalarAttributeTypeS},
		{Name: "contest_id-student_id-index", Partition: "contest_id", Sort: "student_id",
			PartType: types.ScalarAttributeTypeS, SortType: types.ScalarAttributeTypeS},
	}},
}

const (
	partitionKey       = "id"
	tablePollInterval  = 700 * time.Millisecond
	tableActiveTimeout = 90 * time.Second
)

// EnsureTables is the startup migration: it creates every missing table
// (PAY_PER_REQUEST, "id" partition key) and adds missing GSIs to existing
// tables, waiting for each change to become ACTIVE. It is idempotent — a
// fully provisioned account is a no-op — and returns the names of the tables
// it created. A GSI that cannot be added to an existing table is logged and
// skipped (the table keeps serving); only listing failures or an
// un-createable table surface as the error.
func EnsureTables(ctx context.Context, client *dynamodb.Client, defs []Table) (created []string, err error) {
	existing, err := listTables(ctx, client)
	if err != nil {
		return nil, fmt.Errorf("list tables: %w", err)
	}
	existingSet := make(map[string]bool, len(existing))
	for _, n := range existing {
		existingSet[n] = true
	}

	for _, def := range defs {
		if !existingSet[def.Name] {
			if err := createTable(ctx, client, def); err != nil {
				return created, fmt.Errorf("create %s: %w", def.Name, err)
			}
			if err := waitActive(ctx, client, def.Name, def.GSIs); err != nil {
				return created, fmt.Errorf("wait for %s: %w", def.Name, err)
			}
			created = append(created, def.Name)
			log.Printf("schema: created table %s (%d GSI)", def.Name, len(def.GSIs))
			continue
		}
		// Existing table: reconcile indexes so a table created before a GSI
		// shipped (or by hand) still gets the indexes the repositories use.
		added, err := ensureGSIs(ctx, client, def)
		if err != nil {
			log.Printf("schema: %s: %v", def.Name, err)
			continue
		}
		if added > 0 {
			log.Printf("schema: added %d GSI to %s", added, def.Name)
		}
	}
	return created, nil
}

func listTables(ctx context.Context, client *dynamodb.Client) ([]string, error) {
	var names []string
	var last string
	for {
		out, err := client.ListTables(ctx, &dynamodb.ListTablesInput{
			ExclusiveStartTableName: lastOrNil(last),
		})
		if err != nil {
			return nil, err
		}
		names = append(names, out.TableNames...)
		if out.LastEvaluatedTableName == nil {
			return names, nil
		}
		last = *out.LastEvaluatedTableName
	}
}

func lastOrNil(last string) *string {
	if last == "" {
		return nil
	}
	return aws.String(last)
}

func createTable(ctx context.Context, client *dynamodb.Client, def Table) error {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	_, err := client.CreateTable(ctx, &dynamodb.CreateTableInput{
		TableName:            aws.String(def.Name),
		BillingMode:          types.BillingModePayPerRequest,
		AttributeDefinitions: buildAttrDefs(def),
		KeySchema: []types.KeySchemaElement{
			{AttributeName: aws.String(partitionKey), KeyType: types.KeyTypeHash},
		},
		GlobalSecondaryIndexes: buildGSIs(def),
	})
	return err
}

// ensureGSIs adds every GSI the definition requires but the table lacks, in
// one UpdateTable, and waits for them to become ACTIVE. It returns how many
// indexes were added.
func ensureGSIs(ctx context.Context, client *dynamodb.Client, def Table) (int, error) {
	out, err := client.DescribeTable(ctx, &dynamodb.DescribeTableInput{TableName: aws.String(def.Name)})
	if err != nil {
		return 0, fmt.Errorf("describe: %w", err)
	}
	desc := out.Table
	existing := map[string]bool{}
	for _, g := range desc.GlobalSecondaryIndexes {
		existing[aws.ToString(g.IndexName)] = true
	}
	var missing []GSI
	for _, g := range def.GSIs {
		if !existing[g.Name] {
			missing = append(missing, g)
		}
	}
	if len(missing) == 0 {
		return 0, nil
	}

	// Attribute definitions are append-only in DynamoDB: keep the stored ones
	// and add only attribute names that are not already declared.
	attrDefs := append([]types.AttributeDefinition{}, desc.AttributeDefinitions...)
	declared := map[string]bool{}
	for _, a := range attrDefs {
		declared[aws.ToString(a.AttributeName)] = true
	}
	newDefs := buildAttrDefs(Table{GSIs: missing})
	for _, a := range newDefs {
		if !declared[aws.ToString(a.AttributeName)] {
			attrDefs = append(attrDefs, a)
			declared[aws.ToString(a.AttributeName)] = true
		}
	}

	updates := make([]types.GlobalSecondaryIndexUpdate, 0, len(missing))
	// On-demand tables must NOT get a ProvisionedThroughput on created GSIs
	// (real DynamoDB rejects it), while provisioned tables — and local
	// dynalite, which predates billing modes — require one. The table's own
	// billing-mode summary is the discriminator: absent means provisioned.
	onDemand := desc.BillingModeSummary != nil &&
		desc.BillingModeSummary.BillingMode == types.BillingModePayPerRequest
	for _, g := range missing {
		create := &types.CreateGlobalSecondaryIndexAction{
			IndexName:  aws.String(g.Name),
			KeySchema:  keySchema(g),
			Projection: &types.Projection{ProjectionType: types.ProjectionTypeAll},
		}
		if !onDemand {
			create.ProvisionedThroughput = &types.ProvisionedThroughput{
				ReadCapacityUnits:  aws.Int64(1),
				WriteCapacityUnits: aws.Int64(1),
			}
		}
		updates = append(updates, types.GlobalSecondaryIndexUpdate{Create: create})
	}
	utCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	if _, err := client.UpdateTable(utCtx, &dynamodb.UpdateTableInput{
		TableName:                 aws.String(def.Name),
		AttributeDefinitions:      attrDefs,
		GlobalSecondaryIndexUpdates: updates,
	}); err != nil {
		return 0, fmt.Errorf("add %d GSI: %w", len(missing), err)
	}
	if err := waitActive(ctx, client, def.Name, def.GSIs); err != nil {
		return 0, err
	}
	return len(missing), nil
}

func buildAttrDefs(def Table) []types.AttributeDefinition {
	defs := []types.AttributeDefinition{{
		AttributeName: aws.String(partitionKey),
		AttributeType: types.ScalarAttributeTypeS,
	}}
	for _, g := range def.GSIs {
		defs = append(defs, types.AttributeDefinition{
			AttributeName: aws.String(g.Partition),
			AttributeType: g.PartType,
		})
		if g.Sort != "" {
			defs = append(defs, types.AttributeDefinition{
				AttributeName: aws.String(g.Sort),
				AttributeType: g.SortType,
			})
		}
	}
	return dedupeByName(defs)
}

func buildGSIs(def Table) []types.GlobalSecondaryIndex {
	var out []types.GlobalSecondaryIndex
	for _, g := range def.GSIs {
		out = append(out, types.GlobalSecondaryIndex{
			IndexName:  aws.String(g.Name),
			KeySchema:  keySchema(g),
			Projection: &types.Projection{ProjectionType: types.ProjectionTypeAll},
		})
	}
	return out
}

func keySchema(g GSI) []types.KeySchemaElement {
	schema := []types.KeySchemaElement{
		{AttributeName: aws.String(g.Partition), KeyType: types.KeyTypeHash},
	}
	if g.Sort != "" {
		schema = append(schema, types.KeySchemaElement{
			AttributeName: aws.String(g.Sort), KeyType: types.KeyTypeRange,
		})
	}
	return schema
}

func dedupeByName(defs []types.AttributeDefinition) []types.AttributeDefinition {
	seen := map[string]bool{}
	var out []types.AttributeDefinition
	for _, d := range defs {
		if seen[aws.ToString(d.AttributeName)] {
			continue
		}
		seen[aws.ToString(d.AttributeName)] = true
		out = append(out, d)
	}
	return out
}

// waitActive polls until the table is ACTIVE and every wanted GSI reports
// ACTIVE (a nil/empty set means the table status alone is enough).
func waitActive(ctx context.Context, client *dynamodb.Client, table string, wantGSIs []GSI) error {
	deadline := time.Now().Add(tableActiveTimeout)
	for {
		out, err := client.DescribeTable(ctx, &dynamodb.DescribeTableInput{TableName: aws.String(table)})
		if err == nil {
			status := out.Table.TableStatus
			indexesReady := true
			for _, want := range wantGSIs {
				ready := false
				for _, g := range out.Table.GlobalSecondaryIndexes {
					if aws.ToString(g.IndexName) == want.Name && g.IndexStatus == types.IndexStatusActive {
						ready = true
						break
					}
				}
				if !ready {
					indexesReady = false
					break
				}
			}
			if status == types.TableStatusActive && indexesReady {
				return nil
			}
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("table %s not ACTIVE after %s (last describe error: %v)", table, tableActiveTimeout, err)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(tablePollInterval):
		}
	}
}
