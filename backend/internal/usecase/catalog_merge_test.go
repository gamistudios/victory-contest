package usecase

import (
	"errors"
	"testing"
	"victory-contest-go/internal/domain"
)

// The spellings below are the ones students typed in production.
func mergeLocations() domain.Locations {
	return domain.Locations{Regions: []domain.Region{
		{ID: "addis-ababa", Name: "Addis Ababa", Active: true, Cities: []domain.City{
			{ID: "addis-ababa", Name: "Addis Ababa", Active: true},
		}},
		{ID: "oromia", Name: "Oromia", Active: true, Cities: []domain.City{
			{ID: "adama", Name: "Adama", Active: true},
			{ID: "zeway-batu", Name: "Zeway(Batu)", Active: true},
			{ID: "addis-ababa", Name: "Addis Ababa", Active: true}, // the duplicate a promote once minted
		}},
		{ID: "sidama", Name: "Sidama", Active: true, Cities: []domain.City{
			{ID: "hawassa", Name: "Hawassa", Active: true},
		}},
	}}
}

func typed(id, region, city string) domain.Student {
	return domain.Student{ID: id, TelegramID: id + "-tg", Region: region, City: city}
}

func prodSpellings() []domain.Student {
	return []domain.Student{
		typed("s1", "Addis Ababa", "Addis Ababa "),
		typed("s2", "Addis Ababa", "Addis Ababa"),
		typed("s3", "Addis Ababa", "Addis ababa"),
		typed("s4", "Addis Ababa", "Adis abeba"),
		typed("s5", "Addis Ababa", "Adissabeba"),
		typed("s6", "Addis Ababa", "A.A"),
		typed("s7", "adiss abeba", "sheger"),
		typed("s8", "Addis Ababa", "Bole"),
		typed("s9", "Oromia", "Zeway"),
		typed("s10", "Oromia", "Roobee"),
	}
}

type memLocStore struct{ l domain.Locations }

// The DynamoDB store unmarshals a fresh document on every Load, so callers that
// mutate what they got never touch the stored list. The fake has to behave the
// same way, or a test's edits leak into the store it is asserting on.
func copyLocations(l domain.Locations) domain.Locations {
	out := domain.Locations{Regions: make([]domain.Region, 0, len(l.Regions))}
	for _, r := range l.Regions {
		rc := r
		rc.Cities = append([]domain.City(nil), r.Cities...)
		out.Regions = append(out.Regions, rc)
	}
	return out
}

func (m *memLocStore) Load() (*domain.Locations, error) { c := copyLocations(m.l); return &c, nil }
func (m *memLocStore) Save(l domain.Locations) error    { m.l = copyLocations(l); return nil }

type promoteRepo struct {
	StudentRepository
	students []domain.Student
	patched  []domain.Student
	cleared  []string
	fail     map[string]bool
}

func (r *promoteRepo) GetStudents() ([]domain.Student, error) { return r.students, nil }

// ClearStudentLocation mirrors the dedicated write: the ids go, the typed names
// stay, because that is what makes an unlinked student reappear as free text.
func (r *promoteRepo) ClearStudentLocation(id, telegramID string) error {
	if r.fail[id] {
		return errors.New("write failed")
	}
	r.cleared = append(r.cleared, id)
	for i := range r.students {
		if r.students[i].ID == id {
			r.students[i].RegionID, r.students[i].CityID = "", ""
		}
	}
	return nil
}

func (r *promoteRepo) UpdateStudent(s domain.Student) error {
	if r.fail[s.ID] {
		return errors.New("conditional check failed")
	}
	r.patched = append(r.patched, s)
	// Apply the patch the way the table does: only the fields the caller sent.
	for i := range r.students {
		if r.students[i].ID != s.ID {
			continue
		}
		if s.RegionID != "" {
			r.students[i].RegionID = s.RegionID
		}
		if s.Region != "" {
			r.students[i].Region = s.Region
		}
		if s.CityID != "" {
			r.students[i].CityID = s.CityID
		}
		if s.City != "" {
			r.students[i].City = s.City
		}
	}
	return nil
}

func newCatalogUC(locs domain.Locations, students []domain.Student) (*AcademyUsecase, *memLocStore, *promoteRepo) {
	store := &memLocStore{l: locs}
	repo := &promoteRepo{students: students, fail: map[string]bool{}}
	u := &AcademyUsecase{}
	u.SetLocationStore(store)
	u.SetStudentRepo(repo)
	return u, store, repo
}

// One spelling promoted is every spelling of that city promoted: the free-text
// list must show "Adis abeba", "Addis Ababa " and "A.A" as one entry, and the
// promote must link all of them to the single stored city.
func TestFreeTextClustersSpellingVariants(t *testing.T) {
	u, _, _ := newCatalogUC(mergeLocations(), prodSpellings())
	out, err := u.FreeTextLocations()
	if err != nil {
		t.Fatal(err)
	}
	byCity := map[string]FreeTextLocation{}
	for _, x := range out {
		byCity[x.City] = x
	}
	aa, ok := byCity["Addis Ababa"]
	if !ok {
		names := make([]string, 0, len(out))
		for _, x := range out {
			names = append(names, x.City)
		}
		t.Fatalf("no Addis Ababa cluster in %v", names)
	}
	if aa.Count != 6 {
		t.Errorf("Addis Ababa cluster has %d students, want the 6 that typed it: %+v", aa.Count, aa.Variants)
	}
	if !aa.Known || aa.CityID != "addis-ababa" || aa.RegionID != "addis-ababa" {
		t.Errorf("Addis Ababa cluster = %+v, want it linked to the stored city", aa)
	}
	// Sub-cities typed inside Addis Ababa are not the city itself: they stay
	// separate rows so the admin can decide where they belong.
	for _, name := range []string{"Bole", "sheger"} {
		c, ok := byCity[name]
		if !ok {
			t.Errorf("%q should still be listed on its own row", name)
			continue
		}
		if c.Known {
			t.Errorf("%q matched stored city %q, want unmatched free text", name, c.CityID)
		}
	}
	// "Zeway" is how students spell the stored "Zeway(Batu)".
	z := byCity["Zeway(Batu)"]
	if z.Count != 1 || z.CityID != "zeway-batu" || !z.Known {
		t.Errorf("Zeway cluster = %+v, want it recognised as the stored Zeway(Batu)", z)
	}
}

// The acceptance case: promoting a two-student spelling must move the whole
// cluster onto the real Addis Ababa, not create another entry next to it — and
// must take with it the students an earlier promote filed under Oromia.
func TestPromoteMergesWholeClusterIntoStoredCity(t *testing.T) {
	students := append(prodSpellings(), domain.Student{
		ID: "s11", TelegramID: "s11-tg", RegionID: "oromia", Region: "Oromia",
		CityID: "addis-ababa", City: "Addis Ababa",
	})
	u, store, repo := newCatalogUC(mergeLocations(), students)
	out, _ := u.FreeTextLocations()
	var key string
	for _, x := range out {
		if x.City == "Addis Ababa" {
			key = x.Key
		}
	}
	updated, failed, tgt, err := u.PromoteLocation(PromoteLocationInput{GroupKey: key, CityName: "Addis Ababa"})
	if err != nil {
		t.Fatalf("promote: %v", err)
	}
	if failed != 0 {
		t.Errorf("failed writes = %d, want 0", failed)
	}
	if updated != 7 {
		t.Errorf("updated = %d, want the 6 students of the cluster plus the one filed under Oromia", updated)
	}
	if tgt.CityID != "addis-ababa" || tgt.RegionID != "addis-ababa" || !tgt.Merged {
		t.Errorf("target = %+v, want the stored Addis Ababa city in its own region", tgt)
	}
	if len(repo.patched) != 7 {
		t.Fatalf("patched %d rows, want 7", len(repo.patched))
	}
	seen := map[string]domain.Student{}
	for _, p := range repo.patched {
		seen[p.ID] = p
	}
	for _, id := range []string{"s1", "s2", "s3", "s4", "s5", "s6", "s11"} {
		p, ok := seen[id]
		if !ok {
			t.Errorf("student %s was left behind", id)
			continue
		}
		if p.CityID != "addis-ababa" || p.City != "Addis Ababa" || p.RegionID != "addis-ababa" || p.Region != "Addis Ababa" {
			t.Errorf("student %s patched to %+v, want the canonical Addis Ababa", id, p)
		}
	}
	// The list must not grow, and the duplicate entry it carried is gone.
	var cities int
	for _, r := range store.l.Regions {
		for _, c := range r.Cities {
			if c.Name == "Addis Ababa" {
				cities++
			}
		}
	}
	if cities != 1 {
		t.Errorf("the tree holds %d Addis Ababa entries, want the merge to leave one", cities)
	}
	// After the promote those students are no longer free text.
	if left, _ := u.FreeTextLocations(); len(left) != 4 {
		t.Errorf("%d free-text rows remain, want 4 (Bole, sheger, Zeway, Roobee): %+v", len(left), left)
	}
}

// Choosing the wrong region cannot create a second city of the same name: the
// stored one is where the students go.
func TestPromoteRefusesToMintDuplicateCityName(t *testing.T) {
	u, store, repo := newCatalogUC(mergeLocations(), []domain.Student{
		typed("s1", "Oromia", "Adis abeba"),
	})
	out, _ := u.FreeTextLocations()
	var cl FreeTextLocation
	for _, x := range out {
		cl = x
	}
	updated, failed, tgt, err := u.PromoteLocation(PromoteLocationInput{
		GroupKey: cl.Key, TargetRegion: "oromia", CityName: "Addis Ababa",
	})
	if err != nil {
		t.Fatalf("promote: %v", err)
	}
	if updated != 1 || failed != 0 {
		t.Errorf("updated=%d failed=%d, want 1/0", updated, failed)
	}
	if tgt.RegionID != "addis-ababa" || !tgt.Merged {
		t.Errorf("target = %+v, want the canonical Addis Ababa region, not a new entry in Oromia", tgt)
	}
	if repo.patched[0].RegionID != "addis-ababa" {
		t.Errorf("student left in region %q", repo.patched[0].RegionID)
	}
	var entries int
	for _, r := range store.l.Regions {
		for _, c := range r.Cities {
			if c.ID == "addis-ababa" {
				entries++
			}
		}
		if r.ID == "oromia" && len(r.Cities) != 2 {
			t.Errorf("Oromia holds %d cities, want its duplicate Addis Ababa removed: %+v", len(r.Cities), r.Cities)
		}
	}
	if entries != 1 {
		t.Errorf("%d cities carry the id addis-ababa, want exactly one", entries)
	}
}

// A place the list really does not have is added where the admin says, with the
// typed spelling replaced by the corrected display name.
func TestPromoteNewCityAndRegion(t *testing.T) {
	students := []domain.Student{
		typed("s1", "Kolfekeranyo", "Kolfe keranyo"),
		typed("s2", "Kolfekeranyo", "kolfe Keranyo"),
	}
	u, store, repo := newCatalogUC(mergeLocations(), students)
	out, _ := u.FreeTextLocations()
	if len(out) != 1 {
		t.Fatalf("got %d clusters, want the two spellings folded into one: %+v", len(out), out)
	}
	updated, failed, tgt, err := u.PromoteLocation(PromoteLocationInput{
		GroupKey: out[0].Key, NewRegionName: "Kolfekeranyo", CityName: "Kolfe Keranyo",
	})
	if err != nil {
		t.Fatalf("promote: %v", err)
	}
	if updated != 2 || failed != 0 {
		t.Errorf("updated=%d failed=%d, want 2/0", updated, failed)
	}
	if tgt.RegionID != "kolfekeranyo" || tgt.CityID != "kolfe-keranyo" || tgt.Merged {
		t.Errorf("target = %+v, want a newly created Kolfe Keranyo", tgt)
	}
	var found bool
	for _, r := range store.l.Regions {
		if r.ID == "kolfekeranyo" && len(r.Cities) == 1 && r.Cities[0].Name == "Kolfe Keranyo" {
			found = true
		}
	}
	if !found {
		t.Errorf("region/city not stored: %+v", store.l.Regions[len(store.l.Regions)-1])
	}
	for _, p := range repo.patched {
		if p.City != "Kolfe Keranyo" {
			t.Errorf("student %s kept the typed city %q", p.ID, p.City)
		}
	}
}

// A write that DynamoDB rejects must be counted, not silently dropped.
func TestPromoteCountsFailedWrites(t *testing.T) {
	students := []domain.Student{typed("s1", "Oromia", "Roobee"), typed("s2", "Oromia", "Robe")}
	u, _, repo := newCatalogUC(mergeLocations(), students)
	out, _ := u.FreeTextLocations()
	repo.fail["s2"] = true
	var key string
	for _, x := range out {
		if x.Count == 2 {
			key = x.Key
		}
	}
	if key == "" {
		t.Fatalf("Roobee/Robe did not cluster together: %+v", out)
	}
	updated, failed, _, err := u.PromoteLocation(PromoteLocationInput{GroupKey: key, CityName: "Robe"})
	if err != nil {
		t.Fatalf("promote: %v", err)
	}
	if updated != 1 || failed != 1 {
		t.Errorf("updated=%d failed=%d, want 1/1", updated, failed)
	}
}

func TestPromoteUnknownCluster(t *testing.T) {
	u, _, _ := newCatalogUC(mergeLocations(), prodSpellings())
	_, _, _, err := u.PromoteLocation(PromoteLocationInput{GroupKey: "city:nope", CityName: "Nowhere"})
	if !errors.Is(err, ErrInvalidLocation) {
		t.Errorf("err = %v, want ErrInvalidLocation", err)
	}
}

// Clustering cannot decide that "Bole" is a neighbourhood of Addis Ababa — only
// the admin knows, so the merge is an explicit choice between two listed cities.
func TestMergeCitiesMovesStudentsAndDropsTheEntry(t *testing.T) {
	locs := mergeLocations()
	locs.Regions[0].Cities = append(locs.Regions[0].Cities,
		domain.City{ID: "bole", Name: "Bole", Active: true},
		domain.City{ID: "kiro", Name: "Kiro", Active: true},
	)
	students := []domain.Student{
		{ID: "s1", TelegramID: "s1-tg", RegionID: "addis-ababa", Region: "Addis Ababa", CityID: "bole", City: "Bole"},
		{ID: "s2", TelegramID: "s2-tg", RegionID: "addis-ababa", Region: "Addis Ababa", CityID: "bole", City: "Bole"},
		{ID: "s3", TelegramID: "s3-tg", RegionID: "addis-ababa", Region: "Addis Ababa", CityID: "addis-ababa", City: "Addis Ababa"},
		{ID: "s4", TelegramID: "s4-tg", RegionID: "addis-ababa", Region: "Addis Ababa", CityID: "kiro", City: "Kiro"},
	}
	u, store, repo := newCatalogUC(locs, students)
	repo.fail["s2"] = true
	moved, failed, tgt, err := u.MergeCities(MergeCitiesInput{FromCityID: "bole", ToCityID: "addis-ababa"})
	if err != nil {
		t.Fatalf("merge: %v", err)
	}
	if moved != 1 || failed != 1 {
		t.Errorf("moved=%d failed=%d, want 1/1", moved, failed)
	}
	if tgt.CityID != "addis-ababa" || tgt.RegionID != "addis-ababa" || !tgt.Merged {
		t.Errorf("target = %+v, want the stored Addis Ababa city", tgt)
	}
	for _, p := range repo.patched {
		if p.ID == "s4" {
			t.Errorf("student %s was not on the merged city but got patched", p.ID)
		}
		if p.CityID != "addis-ababa" || p.City != "Addis Ababa" {
			t.Errorf("student %s patched to %+v, want the canonical Addis Ababa", p.ID, p)
		}
	}
	for _, r := range store.l.Regions {
		for _, c := range r.Cities {
			if c.ID == "bole" {
				t.Errorf("the merged-away city is still listed in %s", r.ID)
			}
		}
		if r.ID == "addis-ababa" && len(r.Cities) != 2 {
			t.Errorf("%s holds %d cities, want Bole removed and Kiro kept: %+v", r.ID, len(r.Cities), r.Cities)
		}
	}
}

func TestMergeCitiesRefusesBadPairs(t *testing.T) {
	u, store, _ := newCatalogUC(mergeLocations(), prodSpellings())
	for _, in := range []MergeCitiesInput{{FromCityID: "bole"}, {}, {FromCityID: "bole", ToCityID: "bole"}, {FromCityID: "bole", ToCityID: "nope"}} {
		if _, _, _, err := u.MergeCities(in); !errors.Is(err, ErrInvalidLocation) {
			t.Errorf("merge %+v gave %v, want ErrInvalidLocation", in, err)
		}
	}
	if len(store.l.Regions) != 3 {
		t.Errorf("a rejected merge changed the tree: %+v", store.l.Regions)
	}
}

// The dashboard chart is what the admin reads as "how many students are in this
// city": one city must be one row.
func TestCityStatsFoldSpellingVariants(t *testing.T) {
	locs := mergeLocations()
	u := &adminUsecase{}
	u.WithLocations(func() domain.Locations { return locs })
	stats := u.calculateUserStats(prodSpellings(), nil)
	got := map[string]int{}
	for _, c := range stats.ByCity {
		got[c.City] += c.Count
	}
	if got["Addis Ababa"] != 6 {
		t.Errorf("Addis Ababa city stats = %d (%v), want the 6 students who typed its variants", got["Addis Ababa"], stats.ByCity)
	}
	if got["Zeway(Batu)"] != 1 {
		t.Errorf("Zeway(Batu) = %d, want the student who typed Zeway", got["Zeway(Batu)"])
	}
	if len(stats.ByCity) != 5 {
		t.Errorf("%d city rows, want 5 (Addis Ababa, sheger, Bole, Zeway(Batu), Roobee): %v", len(stats.ByCity), stats.ByCity)
	}
	total := 0
	for _, c := range stats.ByCity {
		total += c.Count
	}
	if total != len(prodSpellings()) {
		t.Errorf("city rows sum to %d, want every one of the %d students counted once", total, len(prodSpellings()))
	}
}
