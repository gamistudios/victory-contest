package migrations

import (
	"strings"
	"testing"

	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/locnorm"
	"victory-contest-go/internal/usecase"
)

// dedupeLocations is the production shape: the id addis-ababa stored under two
// regions (the duplicate an old promote minted) plus a real Oromia city.
func dedupeLocations() domain.Locations {
	return domain.Locations{Regions: []domain.Region{
		{ID: "addis-ababa", Name: "Addis Ababa", Active: true, Cities: []domain.City{
			{ID: "addis-ababa", Name: "Addis Ababa", Active: true},
		}},
		{ID: "oromia", Name: "Oromia", Active: true, Cities: []domain.City{
			{ID: "adama", Name: "Adama", Active: true},
			{ID: "zeway-batu", Name: "Zeway(Batu)", Active: true},
			{ID: "addis-ababa", Name: "Addis Ababa", Active: true},
		}},
	}}
}

func dedupeIndexes() (map[string]usecase.CityLocation, *locnorm.Index, *locnorm.Index) {
	locs, _ := usecase.CanonicalLocations(dedupeLocations())
	return usecase.CityLocations(locs),
		locnorm.NewIndex(usecase.KnownCities(locs)),
		locnorm.NewIndex(usecase.KnownRegions(locs))
}

func TestCanonicalLocationsKeepsTheHomenameRegion(t *testing.T) {
	locs, dropped := usecase.CanonicalLocations(dedupeLocations())
	if dropped != 1 {
		t.Fatalf("dropped = %d, want the Oromia copy removed", dropped)
	}
	owned := usecase.CityLocations(locs)
	got := owned["addis-ababa"]
	if got.RegionID != "addis-ababa" || got.CityName != "Addis Ababa" {
		t.Errorf("addis-ababa owned by %+v, want the region of the same name", got)
	}
	if _, ok := owned["adama"]; !ok {
		t.Errorf("a city that was never duplicated disappeared: %+v", locs)
	}
	// The input must survive untouched: the migration still needs it for backup.
	if len(dedupeLocations().Regions[1].Cities) != 3 {
		t.Errorf("CanonicalLocations mutated the caller's list")
	}
}

// The acceptance case: the students who typed a spelling of Addis Ababa and the
// ones an old promote filed under Oromia must all end up on the one entry, so the
// city count grows instead of the promote appearing to change nothing.
func TestLocationFixLinksTypedSpellingsAndStrays(t *testing.T) {
	owned, cityIdx, regionIdx := dedupeIndexes()
	for _, st := range []domain.Student{
		{ID: "typed", Region: "Addis Ababa", City: "Adis abeba"},
		{ID: "abbrev", Region: "Addis Ababa", City: "A.A"},
		{ID: "trailing", Region: "Addis Ababa", City: "Addis Ababa "},
		{ID: "stray", RegionID: "oromia", Region: "Oromia", CityID: "addis-ababa", City: "Addis Ababa"},
	} {
		p := locationFix(st, owned, cityIdx, regionIdx)
		if p.Reason == "" {
			t.Errorf("%s: no patch, the student would stay where they are", st.ID)
			continue
		}
		if p.RegionID != "addis-ababa" || p.CityID != "addis-ababa" || p.City != "Addis Ababa" {
			t.Errorf("%s patched to %+v, want the canonical Addis Ababa entry", st.ID, p)
		}
	}
}

func TestLocationFixLeavesCanonicalAndUnknownAlone(t *testing.T) {
	owned, cityIdx, regionIdx := dedupeIndexes()
	for name, st := range map[string]domain.Student{
		"already canonical":  {ID: "a", RegionID: "addis-ababa", Region: "Addis Ababa", CityID: "addis-ababa", City: "Addis Ababa"},
		"linked oromia city": {ID: "b", RegionID: "oromia", Region: "Oromia", CityID: "adama", City: "Adama"},
		"free text city":     {ID: "c", RegionID: "addis-ababa", Region: "Addis Ababa", City: "Bole"},
		"no location":        {ID: "d"},
		"empty city":         {ID: "e", Region: "Addis Ababa", City: "   "},
	} {
		if p := locationFix(st, owned, cityIdx, regionIdx); p.Reason != "" {
			t.Errorf("%s: got patch %+v, want none", name, p)
		}
	}
	// A free-text city under a typed region still gets the region link, because
	// that is what makes it one row in the admin list instead of an orphan.
	p := locationFix(domain.Student{ID: "f", Region: "adiss abeba", City: "sheger"}, owned, cityIdx, regionIdx)
	if p.Reason != "typed region" || p.RegionID != "addis-ababa" || p.CityID != "" {
		t.Errorf("typed-region patch = %+v, want the region linked and the city left free", p)
	}
}

func TestPatchExpressionWritesOnlyThePatch(t *testing.T) {
	expr, vals, names, cond := patchExpression(
		locationPatch{RegionID: "addis-ababa", Region: "Addis Ababa", CityID: "addis-ababa", City: "Addis Ababa"},
		domain.Student{ID: "s", RegionID: "oromia", CityID: "addis-ababa"})
	if strings.Count(expr, "=") != 4 || len(names) != 4 {
		t.Errorf("wrote %q / %v, want the four location fields", expr, names)
	}
	for _, ph := range []string{":region_id", ":region", ":city_id", ":city"} {
		if _, ok := vals[ph]; !ok {
			t.Errorf("%s missing from %v", ph, vals)
		}
	}
	// The guard is what makes a rerun safe: the values the scan read must still hold.
	if !strings.Contains(cond, "city_id = :was_city_id") || !strings.Contains(cond, "region_id = :was_region_id") {
		t.Errorf("condition %q does not pin the scanned values", cond)
	}
	if vals[":was_city_id"] == nil {
		t.Errorf("missing the scanned city_id guard value")
	}
	regionOnly, _, _, _ := patchExpression(locationPatch{RegionID: "addis-ababa", Region: "Addis Ababa", Reason: "typed region"},
		domain.Student{ID: "s", Region: "adiss abeba", City: "sheger"})
	if strings.Contains(regionOnly, "city") {
		t.Errorf("region-only patch wrote the city: %q", regionOnly)
	}
}
