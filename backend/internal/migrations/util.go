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
