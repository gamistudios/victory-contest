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
	for _, r := range l.Regions {
		if strings.TrimSpace(r.ID) == "" || strings.TrimSpace(r.Name) == "" || seenR[r.ID] {
			return ErrInvalidLocation
		}
		seenR[r.ID] = true
		seenC := map[string]bool{}
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

// FreeTextLocation is one distinct "Other" entry typed by students.
type FreeTextLocation struct {
	RegionID string `json:"region_id,omitempty"` // set when the region is known and only the city is free text
	Region   string `json:"region"`
	City     string `json:"city"`
	Count    int    `json:"count"`
}

// PromoteLocationInput maps one free-text group onto a (new or existing) region/city.
type PromoteLocationInput struct {
	FromRegionID  string `json:"from_region_id"`
	FromRegion    string `json:"from_region"`
	FromCity      string `json:"from_city"`
	TargetRegion  string `json:"target_region_id"` // existing region id, or empty to create
	NewRegionName string `json:"new_region_name"`  // used when TargetRegion is empty
	CityName      string `json:"city_name"`        // display name; defaults to FromCity
}

func normLoc(s string) string { return strings.ToLower(strings.Join(strings.Fields(s), " ")) }

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

// FreeTextLocations lists the distinct unmatched region/city entries, most common first.
func (u *AcademyUsecase) FreeTextLocations() ([]FreeTextLocation, error) {
	if u.studentRepo == nil {
		return nil, errors.New("student repository not configured")
	}
	students, err := u.studentRepo.GetStudents()
	if err != nil {
		return nil, err
	}
	groups := map[string]*FreeTextLocation{}
	for _, st := range students {
		if st.CityID != "" || strings.TrimSpace(st.City) == "" {
			continue
		}
		if st.RegionID == "" && strings.TrimSpace(st.Region) == "" {
			continue
		}
		k := st.RegionID + "|" + normLoc(st.Region) + "|" + normLoc(st.City)
		g := groups[k]
		if g == nil {
			g = &FreeTextLocation{RegionID: st.RegionID, Region: strings.TrimSpace(st.Region), City: strings.TrimSpace(st.City)}
			groups[k] = g
		}
		g.Count++
	}
	out := make([]FreeTextLocation, 0, len(groups))
	for _, g := range groups {
		out = append(out, *g)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count != out[j].Count {
			return out[i].Count > out[j].Count
		}
		return out[i].City < out[j].City
	})
	return out, nil
}

// PromoteLocation adds the region/city to the stored list (if missing) and
// links every matching student to the stable ids. Returns the students updated.
func (u *AcademyUsecase) PromoteLocation(in PromoteLocationInput) (int, error) {
	if u.studentRepo == nil {
		return 0, errors.New("student repository not configured")
	}
	cityName := strings.TrimSpace(in.CityName)
	if cityName == "" {
		cityName = strings.TrimSpace(in.FromCity)
	}
	if locSlug(cityName) == "" {
		return 0, ErrInvalidLocation
	}
	locs := u.Locations()
	ri := -1
	switch {
	case in.FromRegionID != "":
		in.TargetRegion = in.FromRegionID // the region is already known: only the city is promoted
	case in.TargetRegion == "" && strings.TrimSpace(in.NewRegionName) == "":
		return 0, ErrInvalidLocation
	}
	if in.TargetRegion != "" {
		for i, r := range locs.Regions {
			if r.ID == in.TargetRegion {
				ri = i
			}
		}
		if ri < 0 {
			return 0, ErrInvalidLocation
		}
	} else {
		name := strings.TrimSpace(in.NewRegionName)
		id := locSlug(name)
		if id == "" {
			return 0, ErrInvalidLocation
		}
		for i, r := range locs.Regions {
			if r.ID == id || normLoc(r.Name) == normLoc(name) {
				ri = i
			}
		}
		if ri < 0 {
			locs.Regions = append(locs.Regions, domain.Region{ID: id, Name: name, Active: true, SortOrder: len(locs.Regions) + 1})
			ri = len(locs.Regions) - 1
		}
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
	}
	region.Active, region.Cities[ci].Active = true, true
	rid, rname, cname := region.ID, region.Name, region.Cities[ci].Name
	if err := u.SaveLocations(locs); err != nil {
		return 0, err
	}

	students, err := u.studentRepo.GetStudents()
	if err != nil {
		return 0, err
	}
	updated := 0
	for _, st := range students {
		if st.CityID != "" || normLoc(st.City) != normLoc(in.FromCity) {
			continue
		}
		if st.RegionID != in.FromRegionID || (in.FromRegionID == "" && normLoc(st.Region) != normLoc(in.FromRegion)) {
			continue
		}
		patch := domain.Student{ID: st.ID, TelegramID: st.TelegramID, RegionID: rid, Region: rname, CityID: cid, City: cname}
		if err := u.studentRepo.UpdateStudent(patch); err != nil {
			log.Printf("locations: promote failed for student %s: %v", st.ID, err)
			continue
		}
		updated++
	}
	return updated, nil
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
