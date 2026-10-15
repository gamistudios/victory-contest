package migrations

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/repository"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// The live repair runs against two tables at once: the location document in
// reference_data (plain "id" key) and the student rows in the composite
// (id, telegram_id) table. Both shapes are exercised here, plus the dry run the
// CLI wrapper uses and a rerun of the applied migration.
const migRefTable = "reference_data_dedupe_prod_key_it"

func ensureMigRefTable(t *testing.T, client *dynamodb.Client) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	_, err := client.CreateTable(ctx, &dynamodb.CreateTableInput{
		TableName:   aws.String(migRefTable),
		BillingMode: types.BillingModePayPerRequest,
		AttributeDefinitions: []types.AttributeDefinition{
			{AttributeName: aws.String("id"), AttributeType: types.ScalarAttributeTypeS},
		},
		KeySchema: []types.KeySchemaElement{
			{AttributeName: aws.String("id"), KeyType: types.KeyTypeHash},
		},
	})
	if err != nil {
		var exists *types.ResourceInUseException
		if !errors.As(err, &exists) {
			t.Fatalf("create %s: %v", migRefTable, err)
		}
	}
	deadline := time.Now().Add(10 * time.Second)
	for {
		out, err := client.DescribeTable(ctx, &dynamodb.DescribeTableInput{TableName: aws.String(migRefTable)})
		if err == nil && out.Table != nil && out.Table.TableStatus == types.TableStatusActive {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("wait for %s: last err %v", migRefTable, err)
		}
		time.Sleep(200 * time.Millisecond)
	}
}

func locationOf(t *testing.T, client *dynamodb.Client, id string) domain.Student {
	t.Helper()
	out, err := client.Query(context.TODO(), &dynamodb.QueryInput{
		TableName:              aws.String(migStudentTable),
		KeyConditionExpression: aws.String("id = :id"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":id": &types.AttributeValueMemberS{Value: id},
		},
	})
	if err != nil || len(out.Items) == 0 {
		t.Fatalf("read back %s: %v", id, err)
	}
	var s struct {
		RegionID string `dynamodbav:"region_id"`
		Region   string `dynamodbav:"region"`
		CityID   string `dynamodbav:"city_id"`
		City     string `dynamodbav:"city"`
	}
	if err := attributevalue.UnmarshalMap(out.Items[0], &s); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	return domain.Student{RegionID: s.RegionID, Region: s.Region, CityID: s.CityID, City: s.City}
}

func TestLocalDynamoLocationDedupeOnProdKeyShape(t *testing.T) {
	client := migClient(t)
	ensureMigStudentTable(t, client)
	ensureMigRefTable(t, client)
	dir := t.TempDir()

	store := repository.NewLocationDynamoStore(client, migRefTable)
	if err := store.Save(dedupeLocations()); err != nil {
		t.Fatalf("seed locations: %v", err)
	}
	strayID, typedID, okID := "it-mig-loc-stray", "it-mig-loc-typed", "it-mig-loc-canonical"
	seed := map[string]map[string]types.AttributeValue{
		// A promote that filed the canonical city under Oromia.
		strayID: {
			"id": strAttr(strayID), "telegram_id": strAttr("1001"),
			"region_id": strAttr("oromia"), "region": strAttr("Oromia"),
			"city_id": strAttr("addis-ababa"), "city": strAttr("Addis Ababa"),
		},
		// A student still on a typed spelling.
		typedID: {
			"id": strAttr(typedID), "telegram_id": strAttr("1002"),
			"region": strAttr("Addis Ababa"), "city": strAttr("Adis abeba"),
		},
		// Already correct: the migration must leave it alone.
		okID: {
			"id": strAttr(okID), "telegram_id": strAttr("1003"),
			"region_id": strAttr("addis-ababa"), "region": strAttr("Addis Ababa"),
			"city_id": strAttr("addis-ababa"), "city": strAttr("Addis Ababa"),
		},
	}
	for _, item := range seed {
		putStudent(t, client, item)
	}
	t.Cleanup(func() {
		for _, item := range seed {
			_, _ = client.DeleteItem(context.TODO(), &dynamodb.DeleteItemInput{
				TableName: aws.String(migStudentTable),
				Key: map[string]types.AttributeValue{
					"id": item["id"], "telegram_id": item["telegram_id"],
				},
			})
		}
		_, _ = client.DeleteItem(context.TODO(), &dynamodb.DeleteItemInput{
			TableName: aws.String(migRefTable),
			Key:       map[string]types.AttributeValue{"id": strAttr(repository.LocationsDocID)},
		})
	})

	env := func(apply bool) Env {
		return Env{DB: client, Apply: apply, BackupDir: dir, Out: io.Discard,
			Getenv: func(string) string { return "" }}
	}

	res, err := MigrateLocationDedupe(context.TODO(), env(false), migRefTable, migStudentTable)
	if err != nil {
		t.Fatalf("dry run: %v (%q)", err, res.Summary)
	}
	if !strings.Contains(res.Summary, "nothing written") || !strings.Contains(res.Summary, "students to relink=2") {
		t.Errorf("dry run summary = %q, want two students reported and nothing written", res.Summary)
	}
	if got := locationOf(t, client, strayID); got.RegionID != "oromia" {
		t.Errorf("dry run wrote the stray: %+v", got)
	}
	if cur, err := store.Load(); err != nil || len(cur.Regions[1].Cities) != 3 {
		t.Errorf("dry run touched the location document: %+v err %v", cur, err)
	}

	res, err = MigrateLocationDedupe(context.TODO(), env(true), migRefTable, migStudentTable)
	if err != nil {
		t.Fatalf("apply: %v (summary %q)", err, res.Summary)
	}
	if !strings.Contains(res.Summary, "relinked=2") || !strings.Contains(res.Summary, "dropped=1") || !strings.Contains(res.Summary, "failed=0") {
		t.Errorf("apply summary = %q, want relinked=2 dropped=1 failed=0", res.Summary)
	}
	for _, id := range []string{strayID, typedID} {
		got := locationOf(t, client, id)
		if got.RegionID != "addis-ababa" || got.Region != "Addis Ababa" || got.CityID != "addis-ababa" || got.City != "Addis Ababa" {
			t.Errorf("%s ended up as %+v, want the canonical Addis Ababa entry", id, got)
		}
	}
	if got := locationOf(t, client, okID); got.RegionID != "addis-ababa" || got.City != "Addis Ababa" {
		t.Errorf("the canonical row was rewritten: %+v", got)
	}
	after, err := store.Load()
	if err != nil {
		t.Fatalf("load after apply: %v", err)
	}
	var entries int
	for _, r := range after.Regions {
		for _, c := range r.Cities {
			if c.ID == "addis-ababa" {
				entries++
			}
		}
	}
	if entries != 1 {
		t.Errorf("%d city entries carry addis-ababa, want the dedupe to leave one: %+v", entries, after.Regions)
	}

	// Idempotent: the boot runner can retry a migration, and a second instance
	// must not rewrite rows that are already home.
	res, err = MigrateLocationDedupe(context.TODO(), env(true), migRefTable, migStudentTable)
	if err != nil {
		t.Fatalf("rerun: %v (summary %q)", err, res.Summary)
	}
	if !strings.Contains(res.Summary, "already canonical") {
		t.Errorf("rerun summary = %q, want the migration to report nothing left to do", res.Summary)
	}
	if got := locationOf(t, client, strayID); got.RegionID != "addis-ababa" {
		t.Errorf("rerun disturbed a finished row: %+v", got)
	}
}
