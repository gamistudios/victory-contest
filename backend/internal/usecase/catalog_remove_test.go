package usecase

import (
	"errors"
	"strings"
	"testing"

	"victory-contest-go/internal/domain"
)

func removeFixture() (domain.Locations, []domain.Student) {
	return mergeLocations(), []domain.Student{
		{ID: "o1", TelegramID: "o1-tg", RegionID: "oromia", Region: "Oromia", CityID: "adama", City: "Adama"},
		{ID: "o2", TelegramID: "o2-tg", RegionID: "oromia", Region: "Oromia", CityID: "zeway-batu", City: "Zeway(Batu)"},
		{ID: "o3", TelegramID: "o3-tg", RegionID: "oromia", Region: "Oromia"}, // typed under Oromia, no city yet
		{ID: "d1", TelegramID: "d1-tg", RegionID: "sidama", Region: "Sidama", CityID: "hawassa", City: "Hawassa"},
	}
}

func regionByName(l domain.Locations, name string) (domain.Region, bool) {
	for _, r := range l.Regions {
		if r.Name == name {
			return r, true
		}
	}
	return domain.Region{}, false
}

// Deleting a region cannot delete its students: their cities move into the region
// the admin picks and their rows follow, so nobody ends up pointing at an entry
// the list no longer holds.
func TestRemoveRegionMergesIntoAnotherRegion(t *testing.T) {
	locs, students := removeFixture()
	u, store, repo := newCatalogUC(locs, students)
	res, err := u.RemoveLocation(RemoveLocationInput{Kind: RemoveRegion, SourceID: "oromia", TargetID: "addis-ababa"})
	if err != nil {
		t.Fatalf("remove: %v", err)
	}
	if res.Moved != 3 || res.Unlinked != 0 || res.Failed != 0 {
		t.Errorf("moved=%d unlinked=%d failed=%d, want 3/0/0", res.Moved, res.Unlinked, res.Failed)
	}
	if res.Dropped != "Oromia" {
		t.Errorf("dropped = %q, want Oromia", res.Dropped)
	}
	if res.Target == nil || res.Target.RegionID != "addis-ababa" || !res.Target.Merged {
		t.Errorf("target = %+v, want the Addis Ababa region", res.Target)
	}
	if len(store.l.Regions) != 2 {
		t.Fatalf("%d regions left, want Oromia gone: %+v", len(store.l.Regions), store.l.Regions)
	}
	addis, _ := regionByName(store.l, "Addis Ababa")
	names := []string{}
	for _, c := range addis.Cities {
		names = append(names, c.Name)
	}
	if len(names) != 3 {
		t.Errorf("Addis Ababa holds %v, want its own city plus the two that moved", names)
	}
	// A student with no city keeps the free-text city and only gains a region.
	patched := map[string]domain.Student{}
	for _, p := range repo.patched {
		patched[p.ID] = p
	}
	if p := patched["o1"]; p.CityID != "adama" || p.RegionID != "addis-ababa" || p.Region != "Addis Ababa" {
		t.Errorf("o1 patched to %+v, want Adama inside Addis Ababa", p)
	}
	if p := patched["o3"]; p.CityID != "" || p.RegionID != "addis-ababa" {
		t.Errorf("o3 patched to %+v, want the region set and the empty city left alone", p)
	}
	if _, ok := patched["d1"]; ok {
		t.Errorf("a Sidama student was dragged into the merge")
	}
	// The merged region is gone, and its students are all readable again.
	for _, st := range store.l.Regions {
		if st.ID == "oromia" {
			t.Fatalf("Oromia is still in the list")
		}
	}
	if left, _ := u.FreeTextLocations(); len(left) != 0 {
		t.Errorf("free text after the merge = %+v, want nothing orphaned", left)
	}
}

// The other half of the ask: unlink. The entry leaves the list and its students
// keep the names they typed, which puts them back in the free-text panel instead
// of losing their location.
// The acceptance case the duplicate id leaves behind: a student whose row says
// Oromia but whose city belongs to Addis Ababa. Merging Oromia into Sidama must
// send that student to the region that owns their city, because a row whose
// region_id contradicts its city_id is the corruption this list exists to fix.
func TestRemoveRegionSendsStudentsToTheirCitysOwner(t *testing.T) {
	locs, _ := removeFixture()
	students := []domain.Student{
		{ID: "o1", TelegramID: "o1-tg", RegionID: "oromia", Region: "Oromia", CityID: "adama", City: "Adama"},
		{ID: "x1", TelegramID: "x1-tg", RegionID: "oromia", Region: "Oromia", CityID: "addis-ababa", City: "Addis Ababa"},
	}
	u, _, repo := newCatalogUC(locs, students)
	res, err := u.RemoveLocation(RemoveLocationInput{Kind: RemoveRegion, SourceID: "oromia", TargetID: "sidama"})
	if err != nil {
		t.Fatalf("remove: %v", err)
	}
	if res.Moved != 2 || res.Failed != 0 {
		t.Fatalf("moved=%d failed=%d, want 2/0", res.Moved, res.Failed)
	}
	patched := map[string]domain.Student{}
	for _, p := range repo.patched {
		patched[p.ID] = p
	}
	// The patch carries only what changes: x1's city already pointed at Addis
	// Ababa's own entry, so its region is rewritten and the city is left alone.
	if p := patched["x1"]; p.RegionID != "addis-ababa" || p.Region != "Addis Ababa" || p.CityID != "" {
		t.Errorf("x1 patched to %+v, want the region moved to the owner of its city", p)
	}
	if p := patched["o1"]; p.RegionID != "sidama" || p.CityID != "adama" {
		t.Errorf("o1 patched to %+v, want Adama carried into Sidama", p)
	}
	final := map[string]domain.Student{}
	for _, s := range repo.students {
		final[s.ID] = s
	}
	if s := final["x1"]; s.RegionID != "addis-ababa" || s.CityID != "addis-ababa" {
		t.Errorf("x1 row ended at %+v, want a row whose region holds its city", s)
	}
	if s := final["o1"]; s.RegionID != "sidama" || s.CityID != "adama" {
		t.Errorf("o1 row ended at %+v", s)
	}
}

func TestRemoveRegionUnlinksStudents(t *testing.T) {
	locs, students := removeFixture()
	u, store, repo := newCatalogUC(locs, students)
	res, err := u.RemoveLocation(RemoveLocationInput{Kind: RemoveRegion, SourceID: "oromia"})
	if err != nil {
		t.Fatalf("remove: %v", err)
	}
	if res.Unlinked != 3 || res.Moved != 0 || res.Failed != 0 {
		t.Errorf("unlinked=%d moved=%d failed=%d, want 3/0/0", res.Unlinked, res.Moved, res.Failed)
	}
	if len(store.l.Regions) != 2 {
		t.Errorf("%d regions left, want Oromia gone", len(store.l.Regions))
	}
	if strings.Join(repo.cleared, ",") != "o1,o2,o3" {
		t.Errorf("cleared %v, want the three Oromia students", repo.cleared)
	}
	for _, st := range repo.students {
		if st.ID == "d1" && (st.RegionID != "sidama" || st.CityID != "hawassa") {
			t.Errorf("the Sidama student became %+v, want it untouched", st)
		}
	}
	// The names they typed survived, so the admin can promote them again.
	out, _ := u.FreeTextLocations()
	got := map[string]string{}
	for _, x := range out {
		got[x.City] = x.Region
	}
	if len(out) != 2 || got["Adama"] != "Oromia" || got["Zeway(Batu)"] != "Oromia" {
		t.Errorf("free text = %+v, want Adama and Zeway(Batu) back as typed under Oromia", out)
	}
}

// A region nobody is on needs no destination.
func TestRemoveEmptyRegionJustDeletes(t *testing.T) {
	locs, students := removeFixture()
	u, store, repo := newCatalogUC(locs, students[:2]) // nobody in Sidama
	res, err := u.RemoveLocation(RemoveLocationInput{Kind: RemoveRegion, SourceID: "sidama"})
	if err != nil {
		t.Fatalf("remove: %v", err)
	}
	if res.Moved != 0 || res.Unlinked != 0 || res.Failed != 0 {
		t.Errorf("moved=%d unlinked=%d failed=%d, want 0/0/0", res.Moved, res.Unlinked, res.Failed)
	}
	if len(store.l.Regions) != 2 {
		t.Errorf("%d regions left, want 2", len(store.l.Regions))
	}
	if len(repo.patched) != 0 || len(repo.cleared) != 0 {
		t.Errorf("an empty region wrote student rows: %+v %+v", repo.patched, repo.cleared)
	}
}

func TestUnlinkCityDetachesItsStudents(t *testing.T) {
	locs, students := removeFixture()
	u, store, repo := newCatalogUC(locs, students)
	res, err := u.RemoveLocation(RemoveLocationInput{Kind: RemoveCity, SourceID: "adama"})
	if err != nil {
		t.Fatalf("remove: %v", err)
	}
	if res.Unlinked != 1 || res.Dropped != "Adama" {
		t.Errorf("unlinked=%d dropped=%q, want 1 Adama", res.Unlinked, res.Dropped)
	}
	oromia, ok := regionByName(store.l, "Oromia")
	if !ok {
		t.Fatalf("Oromia disappeared with its city: %+v", store.l.Regions)
	}
	for _, c := range oromia.Cities {
		if c.ID == "adama" {
			t.Errorf("Adama is still listed: %+v", oromia.Cities)
		}
	}
	if strings.Join(repo.cleared, ",") != "o1" {
		t.Errorf("cleared %v, want only the Adama student", repo.cleared)
	}
	if repo.students[1].CityID != "zeway-batu" {
		t.Errorf("the Zeway student lost its link: %+v", repo.students[1])
	}
}

// The city merge already had a button; the same call reaches it, so one sheet can
// offer merge, unlink and delete.
func TestRemoveCityMergeDelegatesToCityMerge(t *testing.T) {
	locs, students := removeFixture()
	u, store, repo := newCatalogUC(locs, students)
	res, err := u.RemoveLocation(RemoveLocationInput{Kind: RemoveCity, SourceID: "zeway-batu", TargetID: "adama"})
	if err != nil {
		t.Fatalf("remove: %v", err)
	}
	if res.Moved != 1 || res.Failed != 0 || res.Target == nil || res.Target.CityID != "adama" {
		t.Errorf("result %+v, want one student moved onto Adama", res)
	}
	oromia, _ := regionByName(store.l, "Oromia")
	if len(oromia.Cities) != 1 || oromia.Cities[0].ID != "adama" {
		t.Errorf("Oromia holds %+v, want Zeway(Batu) folded away and Adama left", oromia.Cities)
	}
	if repo.patched[0].ID != "o2" || repo.patched[0].CityID != "adama" {
		t.Errorf("patched %+v, want the Zeway student onto Adama", repo.patched)
	}
}

// A failed clear must be counted, not shown as success — the same rule the
// promote and merge paths follow.
func TestRemoveCountsFailedUnlinks(t *testing.T) {
	locs, students := removeFixture()
	u, _, repo := newCatalogUC(locs, students)
	repo.fail["o2"] = true
	res, err := u.RemoveLocation(RemoveLocationInput{Kind: RemoveRegion, SourceID: "oromia"})
	if err != nil {
		t.Fatalf("remove: %v", err)
	}
	if res.Unlinked != 2 || res.Failed != 1 {
		t.Errorf("unlinked=%d failed=%d, want 2/1", res.Unlinked, res.Failed)
	}
}

func TestRemoveLocationRefusesBadInput(t *testing.T) {
	locs, students := removeFixture()
	for _, in := range []RemoveLocationInput{
		{Kind: RemoveRegion},
		{Kind: "district", SourceID: "oromia"},
		{Kind: RemoveRegion, SourceID: "nowhere"},
		{Kind: RemoveRegion, SourceID: "oromia", TargetID: "oromia"},
		{Kind: RemoveRegion, SourceID: "oromia", TargetID: "nowhere"},
		{Kind: RemoveCity, SourceID: "nowhere"},
		{Kind: RemoveCity, SourceID: "adama", TargetID: "adama"},
	} {
		u, store, repo := newCatalogUC(locs, students)
		if _, err := u.RemoveLocation(in); !errors.Is(err, ErrInvalidLocation) {
			t.Errorf("remove %+v gave %v, want ErrInvalidLocation", in, err)
		}
		if len(store.l.Regions) != 3 {
			t.Errorf("a rejected remove changed the tree: %+v", store.l.Regions)
		}
		if len(repo.patched) != 0 || len(repo.cleared) != 0 {
			t.Errorf("a rejected remove wrote students: %+v %+v", repo.patched, repo.cleared)
		}
	}
}

// Deleting a row in the editor is one stray click away from orphaning everyone
// standing on it, so the plain save refuses and points at remove.
func TestGuardLocationDropsRefusesOrphaningSave(t *testing.T) {
	locs, students := removeFixture()
	u, _, _ := newCatalogUC(locs, students)

	oromia := u.Locations()
	cur := domain.Locations{}
	for _, r := range oromia.Regions {
		if r.ID != "oromia" {
			cur.Regions = append(cur.Regions, r)
		}
	}
	err := u.GuardLocationDrops(cur)
	if err == nil {
		t.Fatal("saving a list with Oromia deleted was accepted")
	}
	if !strings.Contains(err.Error(), "Oromia") || !strings.Contains(err.Error(), "3 students") {
		t.Errorf("err = %v, want it to name the region and how many students are on it", err)
	}

	// The same for one city.
	hawassa := u.Locations()
	for i, r := range hawassa.Regions {
		if r.ID == "sidama" {
			hawassa.Regions[i].Cities = nil
		}
	}
	if err := u.GuardLocationDrops(hawassa); err == nil || !strings.Contains(err.Error(), "Hawassa") {
		t.Errorf("err = %v, want the dropped city named", err)
	}
}

func TestGuardLocationDropsAllowsRenamesAndEmptyEntries(t *testing.T) {
	locs, students := removeFixture()
	u, _, _ := newCatalogUC(locs, students)

	renamed := u.Locations()
	for i := range renamed.Regions {
		renamed.Regions[i].Name += " Region"
	}
	if err := u.GuardLocationDrops(renamed); err != nil {
		t.Errorf("a rename-only save was refused: %v", err)
	}

	// Sidama holds one student; drop the empty Oromia instead and it passes.
	droppedEmpty := u.Locations()
	kept := droppedEmpty.Regions[:0]
	for _, r := range droppedEmpty.Regions {
		if r.ID != "sidama" || len(r.Cities) > 0 {
			kept = append(kept, r)
		}
	}
	droppedEmpty.Regions = kept
	if err := u.GuardLocationDrops(droppedEmpty); err != nil {
		t.Errorf("save refused: %v", err)
	}

	// A region nobody is on is free to go, even when its cities are listed. The
	// stored fixture carries a duplicate city id, so it is saved in its canonical
	// form first — that is the shape the admin page is served too.
	withEmpty, _ := CanonicalLocations(u.Locations())
	withEmpty.Regions = append(withEmpty.Regions, domain.Region{
		ID: "awaza", Name: "Awaza", Cities: []domain.City{{ID: "awassa-city", Name: "Awassa City"}},
	})
	if err := u.SaveLocations(withEmpty); err != nil {
		t.Fatalf("seed the empty region: %v", err)
	}
	withoutIt := u.Locations()
	final := withoutIt.Regions[:0]
	for _, r := range withoutIt.Regions {
		if r.ID != "awaza" {
			final = append(final, r)
		}
	}
	withoutIt.Regions = final
	if err := u.GuardLocationDrops(withoutIt); err != nil {
		t.Errorf("deleting a region nobody is on was refused: %v", err)
	}
}
