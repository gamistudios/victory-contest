package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func init() { gin.SetMode(gin.TestMode) }

type pagItem struct {
	Name string `json:"name"`
}

func runApply(t *testing.T, query string, items []pagItem) (gin.H, error) {
	t.Helper()
	resp := gin.H{"items": items}
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodGet, "/api/x?"+query, nil)
	err := applyPagination(c, resp, "items", items)
	return resp, err
}

func keys(m gin.H) map[string]bool {
	out := map[string]bool{}
	for k := range m {
		out[k] = true
	}
	return out
}

func TestApplyPagination(t *testing.T) {
	items := make([]pagItem, 25)
	for i := range items {
		items[i] = pagItem{Name: string(rune('a' + i))}
	}

	tests := []struct {
		name       string
		query      string
		wantErr    bool
		wantStatus int
		wantLen    int // len of sliced items, -1 = untouched check skipped
		wantKeys   int // expected number of keys in resp
		wantPage   any
		wantSize   any
		wantTotal  any
		wantMore   any
	}{
		{name: "no params keeps full list and original keys", query: "", wantLen: 25, wantKeys: 1},
		{name: "page only uses default size", query: "page=2", wantLen: 0, wantKeys: 5, wantPage: 2, wantSize: 100, wantTotal: 25, wantMore: false},
		{name: "page only first page full", query: "page=1", wantLen: 25, wantKeys: 5, wantPage: 1, wantSize: 100, wantTotal: 25, wantMore: false},
		{name: "page_size only", query: "page_size=10", wantLen: 10, wantKeys: 5, wantPage: 1, wantSize: 10, wantTotal: 25, wantMore: true},
		{name: "both params slice middle", query: "page=2&page_size=10", wantLen: 10, wantKeys: 5, wantPage: 2, wantSize: 10, wantTotal: 25, wantMore: true},
		{name: "last partial page", query: "page=3&page_size=10", wantLen: 5, wantKeys: 5, wantPage: 3, wantSize: 10, wantTotal: 25, wantMore: false},
		{name: "out of range page empty", query: "page=99&page_size=10", wantLen: 0, wantKeys: 5, wantPage: 99, wantSize: 10, wantTotal: 25, wantMore: false},
		{name: "page_size over max clamps to 500", query: "page=1&page_size=9999", wantLen: 25, wantKeys: 5, wantPage: 1, wantSize: 500, wantTotal: 25, wantMore: false},
		{name: "page zero is 400", query: "page=0", wantErr: true},
		{name: "negative page is 400", query: "page=-1", wantErr: true},
		{name: "non-numeric page is 400", query: "page=abc", wantErr: true},
		{name: "empty page is 400", query: "page=", wantErr: true},
		{name: "page_size zero is 400", query: "page_size=0", wantErr: true},
		{name: "non-numeric page_size is 400", query: "page_size=x", wantErr: true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			resp, err := runApply(t, tc.query, items)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			got := resp["items"].([]pagItem)
			if len(got) != tc.wantLen {
				t.Fatalf("items len = %d, want %d", len(got), tc.wantLen)
			}
			if len(resp) != tc.wantKeys {
				t.Fatalf("resp keys = %v, want %d keys", keys(resp), tc.wantKeys)
			}
			if tc.wantKeys == 1 {
				return
			}
			checks := map[string]any{"page": tc.wantPage, "page_size": tc.wantSize, "total": tc.wantTotal, "has_more": tc.wantMore}
			for k, want := range checks {
				if resp[k] != want {
					t.Fatalf("%s = %v, want %v", k, resp[k], want)
				}
			}
		})
	}
}

func TestApplyPaginationOffset(t *testing.T) {
	items := make([]pagItem, 25)
	for i := range items {
		items[i] = pagItem{Name: string(rune('A' + i))}
	}
	resp, err := runApply(t, "page=2&page_size=10", items)
	if err != nil {
		t.Fatal(err)
	}
	got := resp["items"].([]pagItem)
	if got[0].Name != "K" || got[len(got)-1].Name != "T" {
		t.Fatalf("wrong slice: first=%s last=%s, want K..T", got[0].Name, got[len(got)-1].Name)
	}
}

func TestApplyPaginationEmptyListJSON(t *testing.T) {
	// Out-of-range page on empty list must serialize as [] not null.
	var items []pagItem
	resp, err := runApply(t, "page=1&page_size=10", items)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(resp)
	s := string(b)
	if want := `"items":[]`; len(s) < len(want) || !containsSubstr(s, want) {
		t.Fatalf("marshaled %s does not contain %s", s, want)
	}
}

func containsSubstr(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
