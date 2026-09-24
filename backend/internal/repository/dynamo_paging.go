package repository

import (
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// maxPages bounds the number of Scan/Query pages a single logical read may
// fetch (README §9 issue #41). Every DynamoDB page is capped server-side at
// 1 MB, so one paged read accumulates at most maxPages * 1 MB of raw items —
// enough headroom (≈20 MB / tens of thousands of rows) for every table this
// app has, while keeping memory and latency deterministic. The ctx passed to
// these helpers is the caller's one awsconfig.CallCtx deadline (15 s), which
// now covers the WHOLE page loop, not a single call; a loop that cannot
// finish within that budget fails with the usual context-deadline error.
const maxPages = 20

// errMaxPages is returned when a read is still truncated after maxPages so
// callers surface a real error instead of silently returning partial data
// (the pre-fix behavior: one page, no LastEvaluatedKey handling at all).
var errMaxPages = fmt.Errorf("dynamodb paging: result still truncated after %d pages", maxPages)

// scanPages runs input.Scan repeatedly, threading ExclusiveStartKey through
// LastEvaluatedKey, and returns every item (input is mutated between calls;
// pass a freshly built input). Use it for any Scan whose result set can span
// more than one 1 MB page — including filtered Scans, where matching rows
// may live past the first page even when few items match.
func scanPages(ctx context.Context, db *dynamodb.Client, input *dynamodb.ScanInput) ([]map[string]types.AttributeValue, error) {
	var items []map[string]types.AttributeValue
	for page := 0; page < maxPages; page++ {
		out, err := db.Scan(ctx, input)
		if err != nil {
			return nil, err
		}
		items = append(items, out.Items...)
		if out.LastEvaluatedKey == nil {
			return items, nil
		}
		input.ExclusiveStartKey = out.LastEvaluatedKey
	}
	return nil, errMaxPages
}

// queryPages is the Query counterpart of scanPages: a GSI query on a
// partition-key-only (or range) condition can also exceed one page. Full
// key-condition lookups that return a handful of items are left as plain
// single Query calls; anything documented as returning a list pages here.
func queryPages(ctx context.Context, db *dynamodb.Client, input *dynamodb.QueryInput) ([]map[string]types.AttributeValue, error) {
	var items []map[string]types.AttributeValue
	for page := 0; page < maxPages; page++ {
		out, err := db.Query(ctx, input)
		if err != nil {
			return nil, err
		}
		items = append(items, out.Items...)
		if out.LastEvaluatedKey == nil {
			return items, nil
		}
		input.ExclusiveStartKey = out.LastEvaluatedKey
	}
	return nil, errMaxPages
}
