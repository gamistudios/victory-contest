package usecase

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"

	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/locnorm"
)

// locationsSeedJSON is the developer-maintained starting list of regions and
// cities (plan §5.1, decision 17). Admin edits (Phase 1 admin Locations page)
// are a follow-up; until then this file is the source of truth.
//
//go:embed locations_seed.json
var locationsSeedJSON []byte

// CatalogView is the public GET /api/catalog payload: everything a client needs
// to render every dropdown (registration, filters, admin forms).
type CatalogView struct {
	Programs  []domain.AcademyProgram `json:"programs"`
	Streams   []domain.AcademyStream  `json:"streams"`
	Subjects  []domain.AcademySubject `json:"subjects"`
	Chapters  []domain.AcademyChapter `json:"chapters"`
	Locations domain.Locations        `json:"locations"`
}

// DefaultLocations parses the embedded seed.
func DefaultLocations() domain.Locations {
	var l domain.Locations
	if err := json.Unmarshal(locationsSeedJSON, &l); err != nil {
		panic(fmt.Sprintf("locations_seed.json is corrupt: %v", err))
	}
	return l
}

// Locations returns the current location lists.
// LocationStore persists admin-managed locations (table reference_data).
type LocationStore interface {
	Load() (*domain.Locations, error)
	Save(domain.Locations) error
}

// SetPremiumResolver makes Academy premium follow entitlements.
func (u *AcademyUsecase) SetPremiumResolver(f func(studentID string) bool) { u.premiumResolver = f }

// SetProgramResolver makes Academy locks per program (entitled program ids).
func (u *AcademyUsecase) SetProgramResolver(f func(studentID string) map[string]bool) {
	u.programResolver = f
}

// SetLocationStore switches Locations() to the stored list (seed as fallback).
func (u *AcademyUsecase) SetLocationStore(s LocationStore) { u.locStore = s }

func (u *AcademyUsecase) Locations() domain.Locations {
	if u.locStore != nil {
		if l, err := u.locStore.Load(); err == nil && l != nil && len(l.Regions) > 0 {
			return *l
		}
	}
	return DefaultLocations()
}

// SaveLocations validates and stores the full location list (admin).
func (u *AcademyUsecase) SaveLocations(l domain.Locations) error {
	if u.locStore == nil {
		return errors.New("location store not configured")
	}
	seenR := map[string]bool{}
	// City ids are global, not per region: a student row stores only city_id, so
	// the same id under two regions makes that row's region unknowable.
	seenC := map[string]bool{}
	for _, r := range l.Regions {
		if strings.TrimSpace(r.ID) == "" || strings.TrimSpace(r.Name) == "" || seenR[r.ID] {
			return ErrInvalidLocation
		}
		seenR[r.ID] = true
		for _, c := range r.Cities {
			if strings.TrimSpace(c.ID) == "" || strings.TrimSpace(c.Name) == "" || seenC[c.ID] {
				return ErrInvalidLocation
			}
			seenC[c.ID] = true
		}
	}
	old := u.Locations()
	if err := u.locStore.Save(l); err != nil {
		return err
	}
	u.propagateLocationRenames(old, l)
	return nil
}

// ---- free-text location promotion (plan §5.1) ----

// FreeTextLocation is one cluster of "Other" entries students typed. The cluster
// is keyed by canonical spelling, so "Adis Abeba", "Addis Ababa " and
// "AddisAbaba" are one row that promotes as one, instead of three promotions that
// each leave their own city behind.
type FreeTextLocation struct {
	Key      string   `json:"key"` // canonical cluster id, sent back to promote the whole cluster
	RegionID string   `json:"region_id,omitempty"`
	Region   string   `json:"region"`
	CityID   string   `json:"city_id,omitempty"` // set when the typed name is already a stored city
	City     string   `json:"city"`
	Known    bool     `json:"known"` // promoting links to that stored city: no new entry is minted
	Variants []string `json:"variants,omitempty"`
	Count    int      `json:"count"`
}

// PromoteLocationInput promotes one cluster onto a stored or a new region/city.
type PromoteLocationInput struct {
	GroupKey      string `json:"group_key"`        // the cluster's key from the free-text list
	TargetRegion  string `json:"target_region_id"` // existing region id, or empty to follow the cluster
	NewRegionName string `json:"new_region_name"`  // used when no region matches
	CityName      string `json:"city_name"`        // display name; defaults to the cluster's
}

// PromoteTarget is where a promote landed the students. The admin needs it: when
// the typed name matched a stored city the students were merged into that city's
// own region, which is not the region row they were typed under.
type PromoteTarget struct {
	RegionID   string `json:"region_id"`
	RegionName string `json:"region"`
	CityID     string `json:"city_id"`
	CityName   string `json:"city"`
	Merged     bool   `json:"merged"` // the city was already in the list
}

// KnownRegions indexes the stored regions for canonical name resolution.
func KnownRegions(locs domain.Locations) []locnorm.Known {
	out := make([]locnorm.Known, 0, len(locs.Regions))
	for _, r := range locs.Regions {
		out = append(out, locnorm.Known{ID: r.ID, Name: r.Name})
	}
	return out
}

// KnownCities indexes every stored city, carrying the region that owns it.
func KnownCities(locs domain.Locations) []locnorm.Known {
	var out []locnorm.Known
	for _, r := range locs.Regions {
		for _, c := range r.Cities {
			out = append(out, locnorm.Known{ID: c.ID, Name: c.Name, GroupID: r.ID, GroupName: r.Name})
		}
	}
	return out
}

// dedupeCityIDs keeps one list entry per city id. A student row stores only the
// city id, so the same id filed under two regions — which promotes produced
// before they merged — makes that row's region a guess. The copy stored under a
// region of the same name survives; the others are dropped, and the students that
// pointed at any copy now resolve to the entry that is left.
func dedupeCityIDs(l *domain.Locations) {
	keep := map[string]int{}
	for i, r := range l.Regions {
		for _, c := range r.Cities {
			if _, seen := keep[c.ID]; !seen {
				keep[c.ID] = i
				continue
			}
			if locnorm.Fold(r.Name) == locnorm.Fold(c.Name) {
				keep[c.ID] = i
			}
		}
	}
	for i, r := range l.Regions {
		kept := r.Cities[:0]
		for _, c := range r.Cities {
			if keep[c.ID] == i {
				kept = append(kept, c)
			}
		}
		l.Regions[i].Cities = kept
	}
}

// CityLocation is where a city id lives in the list: the entry plus the region
// that owns it. City ids are global, so these four fields are a complete
// location for a student row.
type CityLocation struct {
	RegionID   string `json:"region_id"`
	RegionName string `json:"region"`
	CityID     string `json:"city_id"`
	CityName   string `json:"city"`
}

// CanonicalLocations returns the list carrying one entry per city id and the
// number of duplicate copies it dropped. The boot migration and every admin path
// must agree on which copy survives, so the rule is stated once here.
func CanonicalLocations(l domain.Locations) (domain.Locations, int) {
	before := 0
	out := domain.Locations{Regions: make([]domain.Region, len(l.Regions))}
	for i, r := range l.Regions {
		before += len(r.Cities)
		rc := r
		rc.Cities = append([]domain.City(nil), r.Cities...)
		out.Regions[i] = rc
	}
	dedupeCityIDs(&out)
	after := 0
	for _, r := range out.Regions {
		after += len(r.Cities)
	}
	return out, before - after
}

// CityLocations indexes the list by city id.
func CityLocations(l domain.Locations) map[string]CityLocation {
	out := make(map[string]CityLocation)
	for _, r := range l.Regions {
		for _, c := range r.Cities {
			out[c.ID] = CityLocation{RegionID: r.ID, RegionName: r.Name, CityID: c.ID, CityName: c.Name}
		}
	}
	return out
}

// freeCluster is one cluster with its students and the spellings they typed.
type freeCluster struct {
	FreeTextLocation
	members   []domain.Student
	citySpell map[string]int
	regSpell  map[string]int
}

// clusterFreeText groups the students who typed a place the list does not hold
// yet. A typed city the list recognises joins that city (and its own region), so
// promoting it merges into the existing entry instead of adding a second one.
func clusterFreeText(locs domain.Locations, students []domain.Student) []*freeCluster {
	cityIdx := locnorm.NewIndex(KnownCities(locs))
	regionIdx := locnorm.NewIndex(KnownRegions(locs))
	owned := CityLocations(locs)
	byKey := map[string]*freeCluster{}
	var order []string
	for _, st := range students {
		// A city_id the list no longer holds is free text again: a merge whose
		// write failed would otherwise leave that student unfindable by the admin.
		if _, linked := owned[st.CityID]; linked || strings.TrimSpace(st.City) == "" {
			continue
		}
		var key string
		head := FreeTextLocation{}
		regionNamed := false
		if ck, ok := cityIdx.Resolve(st.City); ok {
			key = "city:" + ck.ID
			head.CityID, head.City, head.Known = ck.ID, ck.Name, true
			head.RegionID, head.Region = ck.GroupID, ck.GroupName
			regionNamed = true
		} else if rk, ok := regionIdx.Resolve(st.Region); ok {
			key = "free:id:" + rk.ID + ":" + locnorm.Fold(st.City)
			head.City = strings.TrimSpace(st.City)
			head.RegionID, head.Region = rk.ID, rk.Name
			regionNamed = true
		} else {
			key = "free:fold:" + locnorm.Fold(st.Region) + ":" + locnorm.Fold(st.City)
			head.City = strings.TrimSpace(st.City)
			head.Region, head.RegionID = strings.TrimSpace(st.Region), st.RegionID
		}
		c := byKey[key]
		if c == nil {
			c = &freeCluster{FreeTextLocation: head, citySpell: map[string]int{}, regSpell: map[string]int{}}
			c.Key = key
			if regionNamed {
				c.regSpell[head.Region] = 1 // keep the stored name as the label
			}
			byKey[key] = c
			order = append(order, key)
		}
		if !regionNamed {
			if s := strings.TrimSpace(st.Region); s != "" {
				c.regSpell[s]++
			}
		}
		c.citySpell[strings.TrimSpace(st.City)]++
		c.members = append(c.members, st)
	}
	out := make([]*freeCluster, 0, len(order))
	for _, k := range order {
		c := byKey[k]
		c.Count = len(c.members)
		if !c.Known {
			c.City = modeSpelling(c.citySpell)
		}
		if !c.Known && c.RegionID == "" {
			c.Region = modeSpelling(c.regSpell)
		}
		c.Variants = otherSpellings(c.citySpell, c.City)
		out = append(out, c)
	}
	return out
}

// modeSpelling labels a cluster with the spelling its students actually used most.
func modeSpelling(counts map[string]int) string {
	best, n := "", 0
	for s, c := range counts {
		if c > n || (c == n && s < best) {
			best, n = s, c
		}
	}
	return best
}

func otherSpellings(counts map[string]int, label string) []string {
	if len(counts) < 2 {
		return nil
	}
	out := make([]string, 0, len(counts))
	for s := range counts {
		if s != label {
			out = append(out, s)
		}
	}
	sort.Strings(out)
	if len(out) > 6 {
		out = append(out[:6], "…")
	}
	return out
}

// FreeTextLocations lists the unmatched typed places, one row per canonical city,
// most populated first.
func (u *AcademyUsecase) FreeTextLocations() ([]FreeTextLocation, error) {
	if u.studentRepo == nil {
		return nil, errors.New("student repository not configured")
	}
	students, err := u.studentRepo.GetStudents()
	if err != nil {
		return nil, err
	}
	clusters := clusterFreeText(u.Locations(), students)
	out := make([]FreeTextLocation, 0, len(clusters))
	for _, c := range clusters {
		out = append(out, c.FreeTextLocation)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count != out[j].Count {
			return out[i].Count > out[j].Count
		}
		return out[i].City < out[j].City
	})
	return out, nil
}

func locSlug(s string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(s) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			dash = false
		} else if !dash && b.Len() > 0 {
			b.WriteByte('-')
			dash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

// PromoteLocation links every student in one free-text cluster to a stored city,
// adding that city to the list only when the list has no name that matches. It
// returns the students updated, the number that could not be written (a promote
// that quietly updated nobody looked identical to one with nobody to promote) and
// where the students ended up.
func (u *AcademyUsecase) PromoteLocation(in PromoteLocationInput) (int, int, *PromoteTarget, error) {
	if u.studentRepo == nil {
		return 0, 0, nil, errors.New("student repository not configured")
	}
	students, err := u.studentRepo.GetStudents()
	if err != nil {
		return 0, 0, nil, err
	}
	locs, _ := CanonicalLocations(u.Locations())
	var cl *freeCluster
	for _, c := range clusterFreeText(locs, students) {
		if c.Key == in.GroupKey {
			cl = c
		}
	}
	if cl == nil {
		return 0, 0, nil, fmt.Errorf("%w: no students are waiting under that entry", ErrInvalidLocation)
	}
	cityName := strings.TrimSpace(in.CityName)
	if cityName == "" {
		cityName = cl.City
	}
	if locSlug(cityName) == "" {
		return 0, 0, nil, ErrInvalidLocation
	}

	tgt := &PromoteTarget{CityName: cityName}
	ri := -1
	// One city, one entry: if the typed name is a place the list already holds,
	// link to it where it is stored instead of minting a second copy under the
	// region the student mistyped.
	if ck, ok := locnorm.NewIndex(KnownCities(locs)).Resolve(cityName); ok {
		for i, r := range locs.Regions {
			if r.ID != ck.GroupID {
				continue
			}
			for _, c := range r.Cities {
				if c.ID == ck.ID {
					ri, tgt.CityID, tgt.CityName, tgt.Merged = i, c.ID, c.Name, true
				}
			}
		}
	}
	if tgt.Merged {
		locs.Regions[ri].Active = true
		for j := range locs.Regions[ri].Cities {
			if locs.Regions[ri].Cities[j].ID == tgt.CityID {
				locs.Regions[ri].Cities[j].Active = true
			}
		}
	}
	if !tgt.Merged {
		if ri < 0 {
			want := in.TargetRegion
			if want == "" {
				want = cl.RegionID
			}
			if want == "" && strings.TrimSpace(in.NewRegionName) != "" {
				if rk, ok := locnorm.NewIndex(KnownRegions(locs)).Resolve(in.NewRegionName); ok {
					want = rk.ID
				}
			}
			for i, r := range locs.Regions {
				if r.ID == want {
					ri = i
				}
			}
		}
		if ri < 0 {
			name := strings.TrimSpace(in.NewRegionName)
			if name == "" {
				name = cl.Region
			}
			id := locSlug(name)
			if id == "" {
				return 0, 0, nil, ErrInvalidLocation
			}
			locs.Regions = append(locs.Regions, domain.Region{ID: id, Name: name, Active: true, SortOrder: len(locs.Regions) + 1})
			ri = len(locs.Regions) - 1
		}
		region := &locs.Regions[ri]
		cid := locSlug(cityName)
		ci := -1
		for i, c := range region.Cities {
			if c.ID == cid {
				ci = i
			}
		}
		if ci < 0 {
			region.Cities = append(region.Cities, domain.City{ID: cid, Name: cityName, Active: true})
			ci = len(region.Cities) - 1
		} else {
			// Same id, different spelling: ids never change, so this is the
			// rename the sheet asked for and propagation fixes the student rows.
			region.Cities[ci].Name = cityName
		}
		region.Active, region.Cities[ci].Active = true, true
		tgt.CityID, tgt.CityName = cid, cityName
	}
	tgt.RegionID, tgt.RegionName = locs.Regions[ri].ID, locs.Regions[ri].Name
	if err := u.SaveLocations(locs); err != nil {
		return 0, 0, nil, err
	}

	write := append([]domain.Student(nil), cl.members...)
	if tgt.Merged {
		// Students already linked to this city but filed under a region that no
		// longer holds it follow it home: a merge has to mean one count.
		for _, st := range students {
			if st.CityID == tgt.CityID && st.RegionID != tgt.RegionID {
				write = append(write, st)
			}
		}
	}
	updated, failed := 0, 0
	for _, st := range write {
		patch := domain.Student{ID: st.ID, TelegramID: st.TelegramID, RegionID: tgt.RegionID, Region: tgt.RegionName, CityID: tgt.CityID, City: tgt.CityName}
		if err := u.studentRepo.UpdateStudent(patch); err != nil {
			log.Printf("locations: promote failed for student %s: %v", st.ID, err)
			failed++
			continue
		}
		updated++
	}
	return updated, failed, tgt, nil
}

// MergeCitiesInput folds one stored city into another.
type MergeCitiesInput struct {
	FromCityID string `json:"from_city_id"` // the entry that disappears
	ToCityID   string `json:"to_city_id"`   // the entry its students join
}

// MergeCities relinks every student on the first city onto the second and drops
// the merged-away entry from the list. Canonical clustering handles spelling
// noise; this is the decision the admin makes for the rest — "Bole", "yeka" and
// "Endbr" are Addis Ababa neighbourhoods, and only they know it.
func (u *AcademyUsecase) MergeCities(in MergeCitiesInput) (int, int, *PromoteTarget, error) {
	if u.studentRepo == nil {
		return 0, 0, nil, errors.New("student repository not configured")
	}
	if in.FromCityID == "" || in.ToCityID == "" || in.FromCityID == in.ToCityID {
		return 0, 0, nil, fmt.Errorf("%w: pick two different cities to merge", ErrInvalidLocation)
	}
	locs, _ := CanonicalLocations(u.Locations())
	tgt := &PromoteTarget{CityID: in.ToCityID}
	fromRI := -1
	for i, r := range locs.Regions {
		for _, c := range r.Cities {
			if c.ID == in.ToCityID {
				tgt.RegionID, tgt.RegionName, tgt.CityName, tgt.Merged = r.ID, r.Name, c.Name, true
			}
			if c.ID == in.FromCityID {
				fromRI = i
			}
		}
	}
	if !tgt.Merged || fromRI < 0 {
		return 0, 0, nil, fmt.Errorf("%w: both cities must be in the list", ErrInvalidLocation)
	}
	students, err := u.studentRepo.GetStudents()
	if err != nil {
		return 0, 0, nil, err
	}
	moving := make([]domain.Student, 0, len(students))
	for _, st := range students {
		if st.CityID == in.FromCityID {
			moving = append(moving, st)
		}
	}
	// Unlink the merged-away entry first: a student still pointing at a city the
	// list no longer has would be unfindable if the writes below then failed.
	locs.Regions[fromRI].Cities = filterCities(locs.Regions[fromRI].Cities, in.FromCityID)
	if err := u.SaveLocations(locs); err != nil {
		return 0, 0, nil, err
	}
	moved, failed := 0, 0
	for _, st := range moving {
		patch := domain.Student{ID: st.ID, TelegramID: st.TelegramID, RegionID: tgt.RegionID, Region: tgt.RegionName, CityID: tgt.CityID, City: tgt.CityName}
		if err := u.studentRepo.UpdateStudent(patch); err != nil {
			log.Printf("locations: merge failed for student %s: %v", st.ID, err)
			failed++
			continue
		}
		moved++
	}
	return moved, failed, tgt, nil
}

func filterCities(cs []domain.City, dropID string) []domain.City {
	out := make([]domain.City, 0, len(cs))
	for _, c := range cs {
		if c.ID != dropID {
			out = append(out, c)
		}
	}
	return out
}

// ---- removing an entry from the list (delete / merge / unlink) ----

// RemoveLocationInput drops one entry from the stored list.
type RemoveLocationInput struct {
	Kind     string `json:"kind"` // RemoveRegion or RemoveCity
	SourceID string `json:"source_id"`
	// TargetID is where the students go: another region (or city). Empty means
	// unlink them — detach the row from the list so it reappears in free text.
	TargetID string `json:"target_id"`
}

// RemoveResult reports what removal did to the students that were on the entry.
type RemoveResult struct {
	Moved    int            `json:"moved"`    // relinked onto another entry
	Unlinked int            `json:"unlinked"` // detached, so they show as free text
	Failed   int            `json:"failed"`   // writes that did not land
	Dropped  string         `json:"dropped"`  // the name that left the list
	Target   *PromoteTarget `json:"target,omitempty"`
}

const (
	RemoveRegion = "region"
	RemoveCity   = "city"
)

// RemoveLocation deletes a region or a city from the list without leaving a
// single student pointing at an entry that no longer exists. A region's students
// either follow its cities into another region or are unlinked back to free
// text; there is no third option, because a row holding a dead id has a location
// nobody can read — not the dashboard, not the admin panel, not the student.
func (u *AcademyUsecase) RemoveLocation(in RemoveLocationInput) (*RemoveResult, error) {
	if u.studentRepo == nil {
		return nil, errors.New("student repository not configured")
	}
	if in.SourceID == "" {
		return nil, fmt.Errorf("%w: pick the entry to remove", ErrInvalidLocation)
	}
	switch in.Kind {
	case RemoveRegion:
		return u.removeRegion(in)
	case RemoveCity:
		if in.TargetID == "" {
			return u.unlinkCity(in.SourceID)
		}
		if in.TargetID == in.SourceID {
			return nil, fmt.Errorf("%w: a city cannot merge into itself", ErrInvalidLocation)
		}
		name := ""
		for _, r := range u.Locations().Regions {
			for _, c := range r.Cities {
				if c.ID == in.SourceID {
					name = c.Name
				}
			}
		}
		moved, failed, tgt, err := u.MergeCities(MergeCitiesInput{FromCityID: in.SourceID, ToCityID: in.TargetID})
		if err != nil {
			return nil, err
		}
		return &RemoveResult{Moved: moved, Failed: failed, Dropped: name, Target: tgt}, nil
	default:
		return nil, fmt.Errorf("%w: kind must be region or city", ErrInvalidLocation)
	}
}

func (u *AcademyUsecase) removeRegion(in RemoveLocationInput) (*RemoveResult, error) {
	if in.TargetID == in.SourceID {
		return nil, fmt.Errorf("%w: a region cannot merge into itself", ErrInvalidLocation)
	}
	locs, _ := CanonicalLocations(u.Locations())
	from, tgt := -1, -1
	for i, r := range locs.Regions {
		if r.ID == in.SourceID {
			from = i
		}
		if in.TargetID != "" && r.ID == in.TargetID {
			tgt = i
		}
	}
	if from < 0 {
		return nil, fmt.Errorf("%w: that region is not in the list", ErrInvalidLocation)
	}
	if in.TargetID != "" && tgt < 0 {
		return nil, fmt.Errorf("%w: that target region is not in the list", ErrInvalidLocation)
	}
	region := locs.Regions[from]

	students, err := u.studentRepo.GetStudents()
	if err != nil {
		return nil, err
	}
	moving := regionStudents(students, region)
	res := &RemoveResult{Dropped: region.Name}

	if tgt < 0 {
		// Unlink. The list is rewritten first: a student still pointing at a
		// region the list holds is at least visible, and if the clears below
		// fail, the free-text panel still finds them by their typed names.
		locs.Regions = dropRegionAt(locs.Regions, from)
		if err := u.SaveLocations(locs); err != nil {
			return nil, err
		}
		for _, st := range moving {
			if err := u.studentRepo.ClearStudentLocation(st.ID, st.TelegramID); err != nil {
				log.Printf("locations: unlink failed for student %s: %v", st.ID, err)
				res.Failed++
				continue
			}
			res.Unlinked++
		}
		return res, nil
	}

	// Merge: the region's cities fold onto the target's same-place cities and the
	// rest move with them, so a city never appears twice under one region.
	target := locs.Regions[tgt]
	merged := make([]domain.City, len(target.Cities), len(target.Cities)+len(region.Cities))
	copy(merged, target.Cities)
	dest := map[string]domain.City{}
	for _, c := range region.Cities {
		at := sameCityIndex(merged, c)
		if at >= 0 {
			dest[c.ID] = merged[at]
			continue
		}
		merged = append(merged, c)
		dest[c.ID] = c
	}
	locs.Regions = dropRegionAt(locs.Regions, from)
	for i := range locs.Regions {
		if locs.Regions[i].ID == target.ID {
			locs.Regions[i].Cities = merged
		}
	}
	if err := u.SaveLocations(locs); err != nil {
		return nil, err
	}

	tgt2 := &PromoteTarget{RegionID: target.ID, RegionName: target.Name, Merged: true}
	// Where each city now lives, after the fold: a student filed under the region
	// being merged but standing on a city that another region owns follows that
	// city instead of the merge target. A row whose region_id contradicts its
	// city_id is the exact shape this list exists to prevent.
	owned := CityLocations(locs)
	for _, st := range moving {
		regionID, regionName := target.ID, target.Name
		if l, ok := owned[st.CityID]; ok && st.CityID != "" {
			regionID, regionName = l.RegionID, l.RegionName
		}
		patch := domain.Student{ID: st.ID, TelegramID: st.TelegramID, RegionID: regionID, Region: regionName}
		if c, ok := dest[st.CityID]; ok && st.CityID != "" {
			patch.CityID, patch.City = c.ID, c.Name
		}
		// A student with no city_id typed their city under this region: the
		// region is fixed, the free-text city stays for the admin to promote.
		if err := u.studentRepo.UpdateStudent(patch); err != nil {
			log.Printf("locations: region merge failed for student %s: %v", st.ID, err)
			res.Failed++
			continue
		}
		res.Moved++
	}
	res.Target = tgt2
	return res, nil
}

func (u *AcademyUsecase) unlinkCity(cityID string) (*RemoveResult, error) {
	locs, _ := CanonicalLocations(u.Locations())
	ri, name := -1, ""
	for i, r := range locs.Regions {
		for _, c := range r.Cities {
			if c.ID == cityID {
				ri, name = i, c.Name
			}
		}
	}
	if ri < 0 {
		return nil, fmt.Errorf("%w: that city is not in the list", ErrInvalidLocation)
	}
	students, err := u.studentRepo.GetStudents()
	if err != nil {
		return nil, err
	}
	moving := make([]domain.Student, 0, len(students))
	for _, st := range students {
		if st.CityID == cityID {
			moving = append(moving, st)
		}
	}
	locs.Regions[ri].Cities = filterCities(locs.Regions[ri].Cities, cityID)
	if err := u.SaveLocations(locs); err != nil {
		return nil, err
	}
	res := &RemoveResult{Dropped: name}
	for _, st := range moving {
		if err := u.studentRepo.ClearStudentLocation(st.ID, st.TelegramID); err != nil {
			log.Printf("locations: city unlink failed for student %s: %v", st.ID, err)
			res.Failed++
			continue
		}
		res.Unlinked++
	}
	return res, nil
}

// regionStudents is every student whose location depends on a region: the ones
// filed under it, and the ones linked to one of its cities even if their
// region_id says something else (a duplicate city id leaves exactly that).
func regionStudents(students []domain.Student, r domain.Region) []domain.Student {
	cityIDs := make(map[string]bool, len(r.Cities))
	for _, c := range r.Cities {
		cityIDs[c.ID] = true
	}
	out := make([]domain.Student, 0, len(students))
	for _, st := range students {
		if st.RegionID == r.ID || (st.CityID != "" && cityIDs[st.CityID]) {
			out = append(out, st)
		}
	}
	return out
}

// sameCityIndex finds the city a moved city folds onto: the same id, or the same
// place under a different spelling.
func sameCityIndex(cs []domain.City, c domain.City) int {
	for i, x := range cs {
		if x.ID == c.ID || locnorm.Fold(x.Name) == locnorm.Fold(c.Name) {
			return i
		}
	}
	return -1
}

func dropRegionAt(rs []domain.Region, at int) []domain.Region {
	out := make([]domain.Region, 0, len(rs)-1)
	for i, r := range rs {
		if i == at {
			continue
		}
		r.SortOrder = len(out) + 1
		out = append(out, r)
	}
	return out
}

// LocationStudentCounts reports how many students stand on each stored entry,
// keyed "region:<id>" and "city:<id>". The admin page labels a removal with it, so
// "delete" is only offered when nothing is on the entry and "unlink N students"
// says N. A student filed under a region but linked to another region's city is
// counted where their city actually lives, which is what a removal follows.
func (u *AcademyUsecase) LocationStudentCounts() (map[string]int, error) {
	if u.studentRepo == nil {
		return nil, errors.New("student repository not configured")
	}
	students, err := u.studentRepo.GetStudents()
	if err != nil {
		return nil, err
	}
	canonical, _ := CanonicalLocations(u.Locations())
	owned := CityLocations(canonical)
	out := map[string]int{}
	for _, st := range students {
		rid := st.RegionID
		if rid == "" {
			if l, ok := owned[st.CityID]; ok {
				rid = l.RegionID
			}
		}
		if rid != "" {
			out["region:"+rid]++
		}
		if st.CityID != "" {
			out["city:"+st.CityID]++
		}
	}
	return out, nil
}

// GuardLocationDrops refuses a plain save that would delete an entry students are
// still standing on. The editor saves the whole list, so removing a row there is
// one stray click away from orphaning everyone on it; the admin has to go through
// remove, which moves or unlinks the students first.
func (u *AcademyUsecase) GuardLocationDrops(cur domain.Locations) error {
	stored := u.Locations()
	keptR, keptC := map[string]bool{}, map[string]bool{}
	for _, r := range cur.Regions {
		keptR[r.ID] = true
		for _, c := range r.Cities {
			keptC[c.ID] = true
		}
	}
	droppedR, droppedC := []string{}, []string{}
	for _, r := range stored.Regions {
		if !keptR[r.ID] {
			droppedR = append(droppedR, r.ID)
		}
		for _, c := range r.Cities {
			if !keptC[c.ID] {
				droppedC = append(droppedC, c.ID)
			}
		}
	}
	if len(droppedR) == 0 && len(droppedC) == 0 {
		return nil
	}
	if u.studentRepo == nil {
		return errors.New("student repository not configured")
	}
	students, err := u.studentRepo.GetStudents()
	if err != nil {
		return err
	}
	isDroppedR := map[string]bool{}
	for _, id := range droppedR {
		isDroppedR[id] = true
	}
	isDroppedC := map[string]bool{}
	for _, id := range droppedC {
		isDroppedC[id] = true
	}
	names := map[string]string{}
	for _, r := range stored.Regions {
		names["region:"+r.ID] = r.Name
		for _, c := range r.Cities {
			names["city:"+c.ID] = c.Name
		}
	}
	countR, countC := map[string]int{}, map[string]int{}
	for _, st := range students {
		if isDroppedR[st.RegionID] {
			countR[st.RegionID]++
		}
		if isDroppedC[st.CityID] {
			countC[st.CityID]++
		}
	}
	problems := make([]string, 0, 2)
	for _, id := range droppedR {
		if n := countR[id]; n > 0 {
			problems = append(problems, fmt.Sprintf("region %q still has %d student%s", names["region:"+id], n, plural(n)))
		}
	}
	for _, id := range droppedC {
		if n := countC[id]; n > 0 {
			problems = append(problems, fmt.Sprintf("city %q still has %d student%s", names["city:"+id], n, plural(n)))
		}
	}
	if len(problems) == 0 {
		return nil
	}
	if len(problems) > 3 {
		problems = append(problems[:2], fmt.Sprintf("and %d more", len(problems)-2))
	}
	return fmt.Errorf("%w: %s — merge them into another entry or unlink them instead of deleting the row",
		ErrInvalidLocation, strings.Join(problems, ", "))
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

// SetStudentRepo enables rename propagation to existing student rows.
func (u *AcademyUsecase) SetStudentRepo(r StudentRepository) { u.studentRepo = r }

// propagateLocationRenames rewrites the stored region/city NAME on students
// whose region_id/city_id was renamed (ids are immutable). Best effort: a
// failure is logged and the rename itself stays saved.
func (u *AcademyUsecase) propagateLocationRenames(old, cur domain.Locations) {
	if u.studentRepo == nil {
		return
	}
	regionNew, cityNew := map[string]string{}, map[string]string{}
	oldRegion, oldCity := map[string]string{}, map[string]string{}
	for _, r := range old.Regions {
		oldRegion[r.ID] = r.Name
		for _, c := range r.Cities {
			oldCity[c.ID] = c.Name
		}
	}
	for _, r := range cur.Regions {
		if n, ok := oldRegion[r.ID]; ok && n != r.Name {
			regionNew[r.ID] = r.Name
		}
		for _, c := range r.Cities {
			if n, ok := oldCity[c.ID]; ok && n != c.Name {
				cityNew[c.ID] = c.Name
			}
		}
	}
	if len(regionNew) == 0 && len(cityNew) == 0 {
		return
	}
	students, err := u.studentRepo.GetStudents()
	if err != nil {
		log.Printf("locations: rename propagation could not list students: %v", err)
		return
	}
	updated := 0
	for _, st := range students {
		patch := domain.Student{ID: st.ID, TelegramID: st.TelegramID}
		changed := false
		if n, ok := regionNew[st.RegionID]; ok && st.RegionID != "" && st.Region != n {
			patch.Region, changed = n, true
		}
		if n, ok := cityNew[st.CityID]; ok && st.CityID != "" && st.City != n {
			patch.City, changed = n, true
		}
		if !changed {
			continue
		}
		if err := u.studentRepo.UpdateStudent(patch); err != nil {
			log.Printf("locations: could not rename on student %s: %v", st.ID, err)
			continue
		}
		updated++
	}
	log.Printf("locations: renamed region/city on %d students", updated)
}

// Catalog returns the active programs plus streams/subjects/chapters. It reuses
// the Academy snapshot (20 s cache); extracting it into a standalone Catalog
// service is planned (see PROGRESS.md "Deferred").
func (u *AcademyUsecase) Catalog() (*CatalogView, error) {
	snap, err := u.snapshot()
	if err != nil {
		return nil, err
	}
	v := &CatalogView{Locations: u.Locations()}
	for _, p := range snap.programs {
		if p.IsActive {
			v.Programs = append(v.Programs, p)
		}
	}
	for _, s := range snap.streams {
		v.Streams = append(v.Streams, s)
	}
	for _, s := range snap.subjects {
		v.Subjects = append(v.Subjects, *s)
	}
	chIDs := make([]string, 0, len(snap.chapters))
	for id := range snap.chapters {
		chIDs = append(chIDs, id)
	}
	sort.Strings(chIDs)
	for _, id := range chIDs {
		v.Chapters = append(v.Chapters, *snap.chapters[id])
	}
	return v, nil
}

// Errors returned by ValidateEnrollment.
var (
	ErrUnknownProgram      = errors.New("unknown or inactive program")
	ErrProgramClosed       = errors.New("program is not open for registration")
	ErrStreamRequired      = errors.New("this program requires a stream")
	ErrStreamNotAllowed    = errors.New("stream is not offered by this program")
	ErrInvalidLocation     = errors.New("invalid region/city")
	ErrNoPrimaryProgram    = errors.New("a primary program is required")
	ErrDuplicateEnrollment = errors.New("already enrolled in this program")
)

// ValidateEnrollment checks a (program, stream) choice against the catalog
// (plan §5.2). Programs with only the common stream force streamID to "common";
// the normalised stream is returned.
func ValidateEnrollment(programs []domain.AcademyProgram, programID, streamID string, requireOpen bool) (string, error) {
	var prog *domain.AcademyProgram
	for i := range programs {
		if programs[i].ID == programID && programs[i].IsActive {
			prog = &programs[i]
			break
		}
	}
	if prog == nil {
		return "", ErrUnknownProgram
	}
	if requireOpen && !prog.OpenForRegistration {
		return "", ErrProgramClosed
	}
	if !prog.NeedsStreamChoice() {
		return domain.StreamCommon, nil
	}
	if streamID == "" {
		return "", ErrStreamRequired
	}
	if !prog.AllowsStream(streamID) {
		return "", ErrStreamNotAllowed
	}
	return streamID, nil
}
