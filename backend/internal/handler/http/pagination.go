package http

import (
	"fmt"
	"strconv"

	"github.com/gin-gonic/gin"
)

// Opt-in pagination for list endpoints (client issue #3: payload size).
//
// Semantics:
//   - If NEITHER ?page nor ?page_size is present, the response is left exactly
//     as-is (full list, no extra keys) — backward compatible for existing clients.
//   - If either is present, pagination activates: page defaults to 1,
//     page_size defaults to defaultPageSize (100) and is clamped to maxPageSize (500).
//   - Invalid values (non-numeric, page < 1, page_size < 1) produce an error and
//     the handler responds 400. Oversized page_size is clamped, not rejected.
//   - Out-of-range pages return an empty (but non-null) slice with has_more=false.
//
// NOTE: slicing happens in the handler AFTER the usecase returns the full list.
// Storage-level paging (DynamoDB Scan/Query Limit + ExclusiveStartKey
// continuation) is a deliberate follow-up; at current data scale the in-memory
// slice is acceptable and the payload-size win for clients is the point.

const (
	defaultPageSize = 100
	maxPageSize     = 500
)

// applyPagination optionally slices items and merges pagination metadata into
// resp under the given list key. It is a no-op (resp untouched, nil error) when
// neither query param is present. On invalid input it returns a non-nil error
// and does not modify resp; callers should answer 400.
func applyPagination[T any](c *gin.Context, resp gin.H, key string, items []T) error {
	pageRaw, hasPage := lookupQuery(c, "page")
	sizeRaw, hasSize := lookupQuery(c, "page_size")
	if !hasPage && !hasSize {
		return nil
	}

	page := 1
	if hasPage {
		p, err := strconv.Atoi(pageRaw)
		if err != nil || p < 1 {
			return fmt.Errorf("invalid page %q: must be a positive integer", pageRaw)
		}
		page = p
	}

	size := defaultPageSize
	if hasSize {
		s, err := strconv.Atoi(sizeRaw)
		if err != nil || s < 1 {
			return fmt.Errorf("invalid page_size %q: must be a positive integer", sizeRaw)
		}
		if s > maxPageSize {
			s = maxPageSize
		}
		size = s
	}

	total := len(items)
	start := (page - 1) * size
	var sliced []T
	switch {
	case start >= total:
		sliced = []T{}
	default:
		end := start + size
		if end > total {
			end = total
		}
		sliced = items[start:end]
	}

	resp[key] = sliced
	resp["page"] = page
	resp["page_size"] = size
	resp["total"] = total
	resp["has_more"] = start+size < total
	return nil
}

// lookupQuery reports whether a raw query parameter is present and its value.
func lookupQuery(c *gin.Context, name string) (string, bool) {
	if _, ok := c.Request.URL.Query()[name]; !ok {
		return "", false
	}
	return c.Query(name), true
}
