package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// The usecase tests prove what a removal does to the data; they cannot prove what
// the admin page receives. These tests drive the real routes and assert the body
// the page reads: the canonical list it is allowed to write back, the counts that
// decide whether a sheet offers Delete or Unlink, and the guard reaching the
// browser as a sentence instead of a 500.

// locStore round-trips through JSON so a caller mutating what Load returned cannot
// write into the stored list, the way the real DynamoDB store cannot.
type locStore struct{ l domain.Locations }

func (m *locStore) Load() (*domain.Locations, error) {
	b, err := json.Marshal(m.l)
	if err != nil {
		return nil, err
	}
	var out domain.Locations
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (m *locStore) Save(l domain.Locations) error { m.l = l; return nil }

type locStudents struct {
	usecase.StudentRepository
	rows    []domain.Student
	cleared []string
}

func (r *locStudents) GetStudents() ([]domain.Student, error) { return r.rows, nil }

func (r *locStudents) UpdateStudent(s domain.Student) error {
	for i := range r.rows {
		if r.rows[i].ID != s.ID {
			continue
		}
		if s.RegionID != "" {
			r.rows[i].RegionID = s.RegionID
		}
		if s.Region != "" {
			r.rows[i].Region = s.Region
		}
		if s.CityID != "" {
			r.rows[i].CityID = s.CityID
		}
		if s.City != "" {
			r.rows[i].City = s.City
		}
	}
	return nil
}

func (r *locStudents) ClearStudentLocation(id, _ string) error {
	r.cleared = append(r.cleared, id)
	for i := range r.rows {
		if r.rows[i].ID == id {
			r.rows[i].RegionID, r.rows[i].CityID = "", ""
		}
	}
	return nil
}

// A legacy duplicate: the same city id under two regions, which is what a
// promote before the merge fix minted.
func locFixture() (domain.Locations, []domain.Student) {
	locs := domain.Locations{Regions: []domain.Region{
		{ID: "addis-ababa", Name: "Addis Ababa", Active: true, SortOrder: 1, Cities: []domain.City{
			{ID: "addis-ababa", Name: "Addis Ababa", Active: true},
			{ID: "bole", Name: "Bole", Active: true},
		}},
		{ID: "oromia", Name: "Oromia", Active: true, SortOrder: 2, Cities: []domain.City{
			{ID: "adama", Name: "Adama", Active: true},
			{ID: "addis-ababa", Name: "Addis Ababa", Active: true}, // the duplicate a promote once minted
		}},
		{ID: "sidama", Name: "Sidama", Active: true, SortOrder: 3, Cities: []domain.City{
			{ID: "hawassa", Name: "Hawassa", Active: true},
		}},
	}}
	students := []domain.Student{
		{ID: "s1", TelegramID: "s1", RegionID: "oromia", Region: "Oromia", CityID: "adama", City: "Adama"},
		{ID: "s2", TelegramID: "s2", RegionID: "oromia", Region: "Oromia", CityID: "addis-ababa", City: "Addis Ababa"},
		{ID: "s3", TelegramID: "s3", RegionID: "addis-ababa", Region: "Addis Ababa", CityID: "bole", City: "Bole"},
		{ID: "s4", TelegramID: "s4", RegionID: "addis-ababa", Region: "Addis Ababa", CityID: "bole", City: "Bole"},
		{ID: "s5", TelegramID: "s5", Region: "Addis Ababa", City: "Adis abeba"},
	}
	return locs, students
}

func locRouter() (*gin.Engine, *locStore, *locStudents) {
	gin.SetMode(gin.TestMode)
	locs, students := locFixture()
	store := &locStore{l: locs}
	repo := &locStudents{rows: students}
	uc := usecase.NewAcademyUsecase(nil, nil, nil)
	uc.SetLocationStore(store)
	uc.SetStudentRepo(repo)
	engine := gin.New()
	NewCatalogHandler(uc).RegisterAdminRoutes(engine.Group("/api/locations-admin"))
	return engine, store, repo
}

func doJSON(t *testing.T, engine *gin.Engine, method, path string, body any) (int, map[string]any) {
	t.Helper()
	var r *http.Request
	if body == nil {
		r = httptest.NewRequest(method, path, nil)
	} else {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		r = httptest.NewRequest(method, path, bytes.NewReader(b))
		r.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, r)
	var out map[string]any
	if w.Body.Len() > 0 {
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatalf("%s %s body is not JSON: %q", method, path, w.Body.String())
		}
	}
	return w.Code, out
}

func regionIDs(regions []any) []string {
	out := make([]string, 0, len(regions))
	for _, x := range regions {
		out = append(out, x.(map[string]any)["id"].(string))
	}
	return out
}

func cityIDs(region any) []string {
	out := []string{}
	cs, _ := region.(map[string]any)["cities"].([]any)
	for _, c := range cs {
		out = append(out, c.(map[string]any)["id"].(string))
	}
	return out
}

// The /merge endpoint was folded into /remove, which handles both kinds; a stale
// admin bundle must not silently hit a route that no longer serves the contract.
func TestLocationsAdminRouteSurface(t *testing.T) {
	engine, _, _ := locRouter()
	for _, want := range []string{
		"GET /api/locations-admin",
		"PUT /api/locations-admin",
		"GET /api/locations-admin/free-text",
		"POST /api/locations-admin/promote",
		"POST /api/locations-admin/remove",
	} {
		var found bool
		for _, r := range engine.Routes() {
			if r.Method+" "+r.Path == want {
				found = true
			}
		}
		if !found {
			t.Errorf("%s is not mounted", want)
		}
	}
	// gin's own 404 body is plain text, so this is checked without the JSON helper.
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, httptest.NewRequest("POST", "/api/locations-admin/merge", nil))
	if w.Code != http.StatusNotFound {
		t.Errorf("POST /merge -> %d, want 404 now that /remove serves it", w.Code)
	}
}

// The list the page is handed must be one it can save back without a fight: a
// stored duplicate cannot appear twice.
func TestGetLocationsServesCanonicalListWithCounts(t *testing.T) {
	engine, _, _ := locRouter()
	code, body := doJSON(t, engine, "GET", "/api/locations-admin", nil)
	if code != http.StatusOK {
		t.Fatalf("GET -> %d", code)
	}
	regions := body["regions"].([]any)
	var entries int
	for _, r := range regions {
		for _, c := range cityIDs(r) {
			if c == "addis-ababa" {
				entries++
			}
		}
	}
	if entries != 1 {
		t.Errorf("%d served entries carry addis-ababa, want one: %v", entries, regions)
	}
	counts := body["counts"].(map[string]any)
	// s2 is filed under Oromia but its city lives in Addis Ababa: the city count
	// follows the city, the region count follows where the row says it is.
	if got := counts["city:addis-ababa"]; got != float64(1) {
		t.Errorf("counts[city:addis-ababa] = %v, want 1", got)
	}
	if got := counts["city:bole"]; got != float64(2) {
		t.Errorf("counts[city:bole] = %v, want 2", got)
	}
	if got := counts["region:oromia"]; got != float64(2) {
		t.Errorf("counts[region:oromia] = %v, want 2", got)
	}
}

func TestRemoveRegionOverHTTP(t *testing.T) {
	engine, store, repo := locRouter()
	code, body := doJSON(t, engine, "POST", "/api/locations-admin/remove", map[string]string{
		"kind": "region", "source_id": "oromia", "target_id": "sidama",
	})
	if code != http.StatusOK {
		t.Fatalf("remove -> %d %v", code, body)
	}
	if body["moved"] != float64(2) || body["failed"] != float64(0) {
		t.Errorf("moved=%v failed=%v, want 2/0", body["moved"], body["failed"])
	}
	if body["dropped"] != "Oromia" {
		t.Errorf("dropped = %v, want the display name the toast repeats", body["dropped"])
	}
	if ids := regionIDs(body["regions"].([]any)); contains(ids, "oromia") {
		t.Errorf("the response still lists the removed region: %v", ids)
	}
	if contains(regionIDs(mustRegions(t, store.l)), "oromia") {
		t.Errorf("stored list still holds Oromia")
	}
	for _, s := range repo.rows {
		if s.ID == "s1" && (s.RegionID != "sidama" || s.CityID != "adama") {
			t.Errorf("s1 ended at %+v, want Adama carried into Sidama", s)
		}
		// s2 was filed under Oromia but stands on Addis Ababa's own city: merging
		// Oromia away must not hand it to Sidama, whose list has no such city.
		if s.ID == "s2" && (s.RegionID != "addis-ababa" || s.CityID != "addis-ababa") {
			t.Errorf("s2 ended at %+v, want its city's owning region", s)
		}
	}
}

func TestRemoveCityUnlinkOverHTTP(t *testing.T) {
	engine, store, repo := locRouter()
	code, body := doJSON(t, engine, "POST", "/api/locations-admin/remove", map[string]string{
		"kind": "city", "source_id": "bole",
	})
	if code != http.StatusOK {
		t.Fatalf("remove -> %d %v", code, body)
	}
	if body["unlinked"] != float64(2) || body["moved"] != float64(0) {
		t.Errorf("unlinked=%v moved=%v, want 2/0", body["unlinked"], body["moved"])
	}
	if len(repo.cleared) != 2 {
		t.Errorf("cleared %v, want both Bole students", repo.cleared)
	}
	for _, s := range repo.rows {
		if s.ID == "s3" && (s.RegionID != "" || s.CityID != "") {
			t.Errorf("s3 kept a link after unlink: %+v", s)
		}
		if s.ID == "s3" && s.City != "Bole" {
			t.Errorf("s3 lost the typed name: %+v — unlink must keep it for free text", s)
		}
	}
	// The point of unlink: the students are findable again on the free-text tab.
	code, ft := doJSON(t, engine, "GET", "/api/locations-admin/free-text", nil)
	if code != http.StatusOK {
		t.Fatalf("free-text -> %d", code)
	}
	items := ft["items"].([]any)
	var found bool
	for _, x := range items {
		if x.(map[string]any)["city"] == "Bole" {
			found = true
		}
	}
	if !found {
		t.Errorf("Bole is not back in free text: %v", items)
	}
	if contains(cityIDs(mustRegion(t, store.l, "addis-ababa")), "bole") {
		t.Errorf("the unlinked city is still listed")
	}
}

func TestRemoveRejectsNonsense(t *testing.T) {
	engine, store, _ := locRouter()
	for _, in := range []map[string]string{
		{"kind": "region", "source_id": "oromia", "target_id": "oromia"},
		{"kind": "city", "source_id": "bole", "target_id": "bole"},
		{"kind": "district", "source_id": "bole"},
		{"kind": "city", "source_id": "nope"},
	} {
		code, body := doJSON(t, engine, "POST", "/api/locations-admin/remove", in)
		if code != http.StatusBadRequest {
			t.Errorf("remove %+v -> %d %v, want 400", in, code, body)
		}
	}
	if len(store.l.Regions) != 3 {
		t.Errorf("a rejected removal changed the stored list: %+v", store.l.Regions)
	}
}

// A save that drops an entry students are still on is refused with the sentence
// the admin acts on, and the stored list stays as it was.
func TestPutLocationsRefusesOrphaningSaveOverHTTP(t *testing.T) {
	engine, store, _ := locRouter()
	locs, _ := usecase.CanonicalLocations(store.l)
	var kept domain.Locations
	for _, r := range locs.Regions {
		if r.ID == "oromia" {
			continue
		}
		kept.Regions = append(kept.Regions, r)
	}
	code, body := doJSON(t, engine, "PUT", "/api/locations-admin", kept)
	if code != http.StatusBadRequest {
		t.Fatalf("PUT without Oromia -> %d %v, want 400", code, body)
	}
	msg, _ := body["error"].(string)
	if !strings.Contains(msg, "Oromia") {
		t.Errorf("error %q does not name the entry", msg)
	}
	if !strings.Contains(msg, "2 students") {
		t.Errorf("error %q does not say how many students are stranded", msg)
	}
	if !contains(regionIDs(mustRegions(t, store.l)), "oromia") {
		t.Errorf("the refused save still changed the stored list")
	}
}

func mustRegions(t *testing.T, l domain.Locations) []any {
	t.Helper()
	b, err := json.Marshal(l.Regions)
	if err != nil {
		t.Fatal(err)
	}
	var out []any
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func mustRegion(t *testing.T, l domain.Locations, id string) any {
	t.Helper()
	for _, r := range mustRegions(t, l) {
		if r.(map[string]any)["id"] == id {
			return r
		}
	}
	t.Fatalf("region %s missing from %+v", id, l.Regions)
	return nil
}

func contains(haystack []string, needle string) bool {
	for _, h := range haystack {
		if h == needle {
			return true
		}
	}
	return false
}
