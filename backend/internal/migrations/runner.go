// Package migrations is the versioned DATA-migration runner. It complements
// schema.EnsureTables (tables/GSIs) and the idempotent seeds: every migration
// has a sortable ID, runs at most once per environment, in ID order, and is
// recorded in the `schema_migrations` table.
//
// ID format: YYYYMMDD-NNN-short-name (for example 20261014-001-grade-9-12).
// Add a new migration by appending to Registry() with a LARGER id; never edit
// or renumber one that has shipped. Migrations must be idempotent: a crash
// halfway, or a second instance, must be safe.
//
// Semantics:
//   - Pending migrations run sequentially in ID order on boot (NewServer).
//   - A failing migration is NOT recorded, stops the run (later ones depend
//     on earlier ones) and is retried on the next boot. The API still boots.
//   - A migration may "defer" (Result.Deferred): it is not recorded and does
//     not block later ones (used when a required setting is absent).
//   - A per-migration lock row (lock#<id>, 15 min TTL) keeps two instances
//     from running the same migration at once.
//   - AUTO_MIGRATE=off|false|0 disables the runner.
package migrations

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// TableName is the DynamoDB table holding applied-migration records.
const TableName = "schema_migrations"

const lockTTL = 15 * time.Minute

var idPattern = regexp.MustCompile(`^\d{8}-\d{3}-[a-z0-9][a-z0-9-]*$`)

// Env is what a migration receives.
type Env struct {
	DB        *dynamodb.Client
	Apply     bool      // false = report only (used by the CLI wrappers)
	BackupDir string    // where JSON backups are written ("" = migration-backups)
	Out       io.Writer // progress output
	Getenv    func(string) string
}

// Result is the outcome of one migration.
type Result struct {
	Summary  string
	Deferred bool // not recorded, does not block later migrations
}

// Migration is one ordered, idempotent data change.
type Migration struct {
	ID          string
	Description string
	Run         func(ctx context.Context, env Env) (Result, error)
}

// Applied is the record stored once a migration succeeded.
type Applied struct {
	ID        string `dynamodbav:"id"`
	Desc      string `dynamodbav:"description"`
	Summary   string `dynamodbav:"summary"`
	AppliedAt string `dynamodbav:"applied_at"`
	Status    string `dynamodbav:"status"`
}

// Validate checks IDs: well-formed, unique and strictly ascending as listed.
func Validate(list []Migration) error {
	seen := map[string]bool{}
	for i, m := range list {
		if !idPattern.MatchString(m.ID) {
			return fmt.Errorf("migration %q: id must look like YYYYMMDD-NNN-name", m.ID)
		}
		if seen[m.ID] {
			return fmt.Errorf("migration %q: duplicate id", m.ID)
		}
		seen[m.ID] = true
		if m.Run == nil {
			return fmt.Errorf("migration %q: missing Run", m.ID)
		}
		if i > 0 && list[i-1].ID >= m.ID {
			return fmt.Errorf("migration %q must sort after %q", m.ID, list[i-1].ID)
		}
	}
	return nil
}

// Sorted returns a copy ordered by ID.
func Sorted(list []Migration) []Migration {
	out := append([]Migration(nil), list...)
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// Enabled reports whether AUTO_MIGRATE allows the boot runner.
func Enabled(getenv func(string) string) bool {
	switch strings.ToLower(strings.TrimSpace(getenv("AUTO_MIGRATE"))) {
	case "off", "false", "0", "no":
		return false
	}
	return true
}

// RunPending applies every migration not yet recorded, in ID order, and
// returns the ids it applied. It stops at the first failure.
func RunPending(ctx context.Context, db *dynamodb.Client, list []Migration, env Env) (applied []string, err error) {
	if env.Getenv == nil {
		env.Getenv = os.Getenv
	}
	if env.Out == nil {
		env.Out = logWriter{}
	}
	env.DB = db
	env.Apply = true
	list = Sorted(list)
	if err := Validate(list); err != nil {
		return nil, err
	}
	done, err := loadApplied(ctx, db)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", TableName, err)
	}
	for _, m := range list {
		if done[m.ID] {
			continue
		}
		got, err := claim(ctx, db, m.ID)
		if err != nil {
			return applied, fmt.Errorf("lock %s: %w", m.ID, err)
		}
		if !got {
			log.Printf("migrations: %s is running on another instance - skipping", m.ID)
			continue
		}
		// Re-check after the lock: another instance may have just finished it.
		if ok, _ := isApplied(ctx, db, m.ID); ok {
			release(ctx, db, m.ID)
			continue
		}
		log.Printf("migrations: running %s (%s)", m.ID, m.Description)
		res, runErr := m.Run(ctx, env)
		if runErr != nil {
			release(ctx, db, m.ID)
			return applied, fmt.Errorf("%s: %w", m.ID, runErr)
		}
		if res.Deferred {
			release(ctx, db, m.ID)
			log.Printf("migrations: %s deferred: %s", m.ID, res.Summary)
			continue
		}
		rec := Applied{ID: m.ID, Desc: m.Description, Summary: res.Summary,
			AppliedAt: time.Now().UTC().Format(time.RFC3339), Status: "applied"}
		if err := putApplied(ctx, db, rec); err != nil {
			release(ctx, db, m.ID)
			return applied, fmt.Errorf("%s: record: %w", m.ID, err)
		}
		release(ctx, db, m.ID)
		applied = append(applied, m.ID)
		log.Printf("migrations: applied %s: %s", m.ID, res.Summary)
	}
	return applied, nil
}

type logWriter struct{}

func (logWriter) Write(p []byte) (int, error) {
	log.Print("migrations: " + strings.TrimRight(string(p), "\n"))
	return len(p), nil
}

func strAttr(s string) types.AttributeValue { return &types.AttributeValueMemberS{Value: s} }

func loadApplied(ctx context.Context, db *dynamodb.Client) (map[string]bool, error) {
	out := map[string]bool{}
	var start map[string]types.AttributeValue
	for {
		resp, err := db.Scan(ctx, &dynamodb.ScanInput{TableName: aws.String(TableName), ExclusiveStartKey: start})
		if err != nil {
			return nil, err
		}
		for _, it := range resp.Items {
			var a Applied
			if attributevalue.UnmarshalMap(it, &a) == nil && a.Status == "applied" && !strings.HasPrefix(a.ID, "lock#") {
				out[a.ID] = true
			}
		}
		if len(resp.LastEvaluatedKey) == 0 {
			return out, nil
		}
		start = resp.LastEvaluatedKey
	}
}

func isApplied(ctx context.Context, db *dynamodb.Client, id string) (bool, error) {
	resp, err := db.GetItem(ctx, &dynamodb.GetItemInput{TableName: aws.String(TableName),
		Key: map[string]types.AttributeValue{"id": strAttr(id)}, ConsistentRead: aws.Bool(true)})
	if err != nil {
		return false, err
	}
	return len(resp.Item) > 0, nil
}

func putApplied(ctx context.Context, db *dynamodb.Client, rec Applied) error {
	item, err := attributevalue.MarshalMap(rec)
	if err != nil {
		return err
	}
	_, err = db.PutItem(ctx, &dynamodb.PutItemInput{TableName: aws.String(TableName), Item: item})
	return err
}

// claim takes the per-migration lock; an expired lock can be taken over.
func claim(ctx context.Context, db *dynamodb.Client, id string) (bool, error) {
	now := time.Now().UTC()
	host, _ := os.Hostname()
	_, err := db.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(TableName),
		Item: map[string]types.AttributeValue{
			"id":         strAttr("lock#" + id),
			"status":     strAttr("running"),
			"host":       strAttr(host),
			"expires_at": strAttr(now.Add(lockTTL).Format(time.RFC3339)),
		},
		ConditionExpression: aws.String("attribute_not_exists(id) OR expires_at < :now"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":now": strAttr(now.Format(time.RFC3339)),
		},
	})
	if err != nil {
		var cf *types.ConditionalCheckFailedException
		if asCondFail(err, &cf) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func release(ctx context.Context, db *dynamodb.Client, id string) {
	_, _ = db.DeleteItem(ctx, &dynamodb.DeleteItemInput{TableName: aws.String(TableName),
		Key: map[string]types.AttributeValue{"id": strAttr("lock#" + id)}})
}
