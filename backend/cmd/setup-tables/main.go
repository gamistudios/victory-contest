package main

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/joho/godotenv"
	"victor-contest-go/internal/awsconfig"
)

type gsi struct {
	name      string
	partition string
	sort      string // "" = partition key only
	partType  types.ScalarAttributeType
	sortType  types.ScalarAttributeType
}

type table struct {
	Name string
	gsis []gsi
}

// Mirrors every IndexName/KeyConditionExpression used in internal/repository.
var tables = []table{
	{Name: "question"},
	{Name: "contests"},
	{Name: "student"},
	{Name: "admin", gsis: []gsi{
		{name: "email-id-index", partition: "email", partType: types.ScalarAttributeTypeS},
	}},
	{Name: "notification", gsis: []gsi{
		{name: "recipient_id-index", partition: "recipient_id", partType: types.ScalarAttributeTypeS},
	}},
	{Name: "achievement"},
	{Name: "banks"},
	{Name: "contest_registeration", gsis: []gsi{
		{name: "contest_id-student_id-index", partition: "contest_id", sort: "student_id",
			partType: types.ScalarAttributeTypeS, sortType: types.ScalarAttributeTypeS},
	}},
	{Name: "payment", gsis: []gsi{
		{name: "GSI1PK-user_id-index", partition: "GSI1PK", sort: "user_id",
			partType: types.ScalarAttributeTypeS, sortType: types.ScalarAttributeTypeS},
		{name: "GSI1PK-status-index", partition: "GSI1PK", sort: "status",
			partType: types.ScalarAttributeTypeS, sortType: types.ScalarAttributeTypeS},
		{name: "GSI1PK-expirationDate-index", partition: "GSI1PK", sort: "expirationDate",
			partType: types.ScalarAttributeTypeS, sortType: types.ScalarAttributeTypeS},
	}},
	{Name: "pageviews", gsis: []gsi{
		{name: "user_id-index", partition: "user_id", partType: types.ScalarAttributeTypeS},
	}},
	{Name: "articles", gsis: []gsi{
		{name: "status-index", partition: "status", partType: types.ScalarAttributeTypeS},
	}},
	{Name: "comments", gsis: []gsi{
		{name: "articleId-index", partition: "articleId", sort: "createdAt",
			partType: types.ScalarAttributeTypeS, sortType: types.ScalarAttributeTypeS},
	}},
	{Name: "feedback_questions"},
	{Name: "poll_options"},
	{Name: "feedback_responses"},
	{Name: "submissions", gsis: []gsi{
		{name: "contest_id-index", partition: "contest_id", partType: types.ScalarAttributeTypeS},
		{name: "student_id-index", partition: "student_id", partType: types.ScalarAttributeTypeS},
		{name: "contest_id-student_id-index", partition: "contest_id", sort: "student_id",
			partType: types.ScalarAttributeTypeS, sortType: types.ScalarAttributeTypeS},
	}},
}

func main() {
	_ = godotenv.Load()
	// Single shared AWS config (issue #45): same loader/region/retry policy
	// the HTTP server uses. CreateTable below already runs under a bounded
	// per-call context (issue #46).
	cfg, err := awsconfig.Load(context.Background())
	if err != nil {
		log.Fatalf("load config: %v", err)
	}
	client := awsconfig.DynamoClient(cfg)

	for _, t := range tables {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		input := &dynamodb.CreateTableInput{
			TableName:            aws.String(t.Name),
			BillingMode:          types.BillingModePayPerRequest,
			AttributeDefinitions: buildAttrDefs(t),
			KeySchema: []types.KeySchemaElement{
				{AttributeName: aws.String("id"), KeyType: types.KeyTypeHash},
			},
			GlobalSecondaryIndexes: buildGSIs(t),
		}
		log.Printf("creating %s ...", t.Name)
		_, err := client.CreateTable(ctx, input)
		cancel()
		if err != nil {
			var exists *types.ResourceInUseException
			if errors.As(err, &exists) {
				log.Printf("%-24s already exists, skipping", t.Name)
				continue
			}
			log.Fatalf("create %s: %v", t.Name, err)
		}
		log.Printf("%-24s created (%d GSI)", t.Name, len(t.gsis))
	}
	time.Sleep(500 * time.Millisecond)
	log.Print("all tables ready")
}

func buildAttrDefs(t table) []types.AttributeDefinition {
	defs := []types.AttributeDefinition{{
		AttributeName: aws.String("id"),
		AttributeType: types.ScalarAttributeTypeS,
	}}
	for _, g := range t.gsis {
		defs = append(defs, types.AttributeDefinition{
			AttributeName: aws.String(g.partition),
			AttributeType: g.partType,
		})
		if g.sort != "" {
			defs = append(defs, types.AttributeDefinition{
				AttributeName: aws.String(g.sort),
				AttributeType: g.sortType,
			})
		}
	}
	return dedupeByName(defs)
}

func buildGSIs(t table) []types.GlobalSecondaryIndex {
	var out []types.GlobalSecondaryIndex
	for _, g := range t.gsis {
		schema := []types.KeySchemaElement{
			{AttributeName: aws.String(g.partition), KeyType: types.KeyTypeHash},
		}
		if g.sort != "" {
			schema = append(schema, types.KeySchemaElement{
				AttributeName: aws.String(g.sort), KeyType: types.KeyTypeRange,
			})
		}
		out = append(out, types.GlobalSecondaryIndex{
			IndexName:  aws.String(g.name),
			KeySchema:  schema,
			Projection: &types.Projection{ProjectionType: types.ProjectionTypeAll},
		})
	}
	return out
}

func dedupeByName(defs []types.AttributeDefinition) []types.AttributeDefinition {
	seen := map[string]bool{}
	var out []types.AttributeDefinition
	for _, d := range defs {
		if seen[*d.AttributeName] {
			continue
		}
		seen[*d.AttributeName] = true
		out = append(out, d)
	}
	return out
}
