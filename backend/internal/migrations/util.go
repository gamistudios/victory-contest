package migrations

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

func asCondFail(err error, target **types.ConditionalCheckFailedException) bool {
	return errors.As(err, target)
}

// scanAll reads every item of a table.
func scanAll(ctx context.Context, db *dynamodb.Client, table string) ([]map[string]types.AttributeValue, error) {
	var out []map[string]types.AttributeValue
	var start map[string]types.AttributeValue
	for {
		resp, err := db.Scan(ctx, &dynamodb.ScanInput{TableName: aws.String(table), ExclusiveStartKey: start})
		if err != nil {
			return nil, err
		}
		out = append(out, resp.Items...)
		if len(resp.LastEvaluatedKey) == 0 {
			return out, nil
		}
		start = resp.LastEvaluatedKey
	}
}

// keyNames returns a table's primary key attribute names. Point operations
// (UpdateItem/GetItem/DeleteItem) must be given the COMPLETE key, so a
// migration cannot assume a lone "id" partition key: the live student table is
// keyed on (id, telegram_id) and an {id}-only write fails with "The provided
// key element does not match the schema".
func keyNames(ctx context.Context, db *dynamodb.Client, table string) ([]string, error) {
	out, err := db.DescribeTable(ctx, &dynamodb.DescribeTableInput{TableName: aws.String(table)})
	if err != nil {
		return nil, fmt.Errorf("describe %s: %w", table, err)
	}
	var names []string
	for _, k := range out.Table.KeySchema {
		names = append(names, aws.ToString(k.AttributeName))
	}
	if len(names) == 0 {
		return nil, fmt.Errorf("table %s has an empty key schema", table)
	}
	return names, nil
}

// fullKey lifts the table's complete primary key off a raw item that scanAll
// just returned. The stored item is the faithful source: it carries every key
// attribute in its original type, so no marshalling guesswork is involved.
func fullKey(names []string, item map[string]types.AttributeValue) (map[string]types.AttributeValue, error) {
	key := make(map[string]types.AttributeValue, len(names))
	for _, n := range names {
		av, ok := item[n]
		if !ok {
			return nil, fmt.Errorf("item missing key attribute %q", n)
		}
		key[n] = av
	}
	return key, nil
}

// writeBackup stores v as JSON under BackupDir and returns the path. A backup
// failure is returned so callers can refuse to write without one.
func writeBackup(env Env, name string, v any) (string, error) {
	dir := env.BackupDir
	if dir == "" {
		dir = "migration-backups"
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(dir, fmt.Sprintf("%s-%s.json", name, time.Now().UTC().Format("20060102T150405Z")))
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return "", err
	}
	return path, os.WriteFile(path, data, 0o600)
}

func say(env Env, format string, a ...any) {
	if env.Out != nil {
		fmt.Fprintf(env.Out, format+"\n", a...)
	}
}
