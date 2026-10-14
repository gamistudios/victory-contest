package usecase

import (
	"encoding/json"
	"fmt"
	"log"

	"victory-contest-go/internal/domain"
)

const academySeedProgramsMarker = "seed_programs_v2"

// programSeedV2 is the additive Phase 1 program catalogue (plan §5.1). Existing
// programs are only ENRICHED (new optional fields filled when still empty);
// nothing is deactivated, renamed or deleted, and admin edits are never
// overwritten. The three new programs are inserted if absent.
var programSeedV2 = []domain.AcademyProgram{
	{ID: "grade-9", Kind: "school_grade", Group: "School grades", Grade: "9", SortOrder: 10, OpenForRegistration: true,
		Features: []string{"lectures", "assessments", "leaderboard", "ai_tutor"}},
	{ID: "grade-10", Kind: "school_grade", Group: "School grades", Grade: "10", SortOrder: 20, OpenForRegistration: true,
		Features: []string{"lectures", "assessments", "leaderboard", "ai_tutor"}},
	{ID: "grade-11", Kind: "school_grade", Group: "School grades", Grade: "11", SortOrder: 30, OpenForRegistration: true,
		Features: []string{"lectures", "assessments", "leaderboard", "ai_tutor"}},
	{ID: "grade-12", Kind: "school_grade", Group: "School grades", Grade: "12", SortOrder: 40, OpenForRegistration: true,
		Features: []string{"lectures", "assessments", "leaderboard", "ai_tutor"}},
	{ID: "entrance-exam", Name: "Entrance Exam (Grade 12)", ShortCode: "EE", IconName: "GraduationCap",
		Description:      "National university entrance exam preparation for Grade 12 students.",
		AvailableStreams: []string{"natural-science", "social-science"}, IsActive: true,
		Kind: "entrance_exam", Group: "Exam preparation", Grade: "12", SortOrder: 50, OpenForRegistration: true,
		Features: []string{"lectures", "assessments", "leaderboard", "ai_tutor"}},
	{ID: "remedial", Kind: "remedial", Group: "University", SortOrder: 60, OpenForRegistration: true,
		Features: []string{"lectures", "assessments", "leaderboard", "ai_tutor"}},
	{ID: "freshman", Name: "Freshman", ShortCode: "FR", IconName: "BookOpen",
		Description:      "Common courses for first-year university students.",
		AvailableStreams: []string{domain.StreamCommon}, IsActive: true,
		Kind: "freshman", Group: "University", SortOrder: 70, OpenForRegistration: true,
		Features: []string{"lectures", "assessments", "leaderboard", "ai_tutor"}},
	{ID: "exit-exam", Kind: "exit_exam", Group: "University", SortOrder: 80, OpenForRegistration: true,
		Features: []string{"lectures", "assessments", "leaderboard", "ai_tutor"}},
	{ID: "training", Name: "Training & Habit Development", ShortCode: "TR", IconName: "Target",
		Description:      "Tutorials and habits for real-life improvement.",
		AvailableStreams: []string{domain.StreamCommon}, IsActive: true,
		Kind: "training", Group: "Personal development", SortOrder: 90, OpenForRegistration: true,
		// no leaderboard: habits are never scored or ranked (decision 16)
		Features: []string{"lectures", "habits"}},
	{ID: "other-programs", Kind: "custom", Group: "Personal development", SortOrder: 100, OpenForRegistration: false,
		Features: []string{"lectures"}},
}

// SeedProgramsV2 is the Phase 1 data migration for programs. It is idempotent
// and safe on every boot (marker written LAST, like SeedIfEmpty). It must run
// AFTER SeedIfEmpty so a fresh database has the v1 programs to enrich.
func (u *AcademyUsecase) SeedProgramsV2() error {
	docs, err := u.repo.ListContent()
	if err != nil {
		return fmt.Errorf("programs seed v2: list content: %w", err)
	}
	existing := map[string]domain.AcademyProgram{}
	for _, d := range docs {
		if d.Kind == academyKindMeta && d.ID == academySeedProgramsMarker {
			return nil
		}
		if d.Kind == academyKindProgram {
			var p domain.AcademyProgram
			if json.Unmarshal(d.Data, &p) == nil {
				existing[p.ID] = p
			}
		}
	}
	for _, want := range programSeedV2 {
		cur, ok := existing[want.ID]
		if !ok {
			b, _ := json.Marshal(want)
			if _, err := u.repo.PutContentIfAbsent(academyKindProgram, want.ID, b); err != nil {
				return fmt.Errorf("programs seed v2: put %s: %w", want.ID, err)
			}
			continue
		}
		if enrichProgram(&cur, want) {
			b, _ := json.Marshal(cur)
			if err := u.repo.PutContent(academyKindProgram, cur.ID, b); err != nil {
				return fmt.Errorf("programs seed v2: update %s: %w", cur.ID, err)
			}
		}
	}
	marker, _ := json.Marshal(map[string]string{"id": academySeedProgramsMarker, "at": academyNow()})
	if _, err := u.repo.PutContentIfAbsent(academyKindMeta, academySeedProgramsMarker, marker); err != nil {
		return fmt.Errorf("programs seed v2: marker: %w", err)
	}
	u.invalidate()
	log.Printf("academy: program seed v2 applied (%d programs)", len(programSeedV2))
	return nil
}

// enrichProgram fills only the still-empty Phase 1 fields of cur from seed and
// reports whether anything changed. Admin-edited values are never overwritten.
func enrichProgram(cur *domain.AcademyProgram, seed domain.AcademyProgram) bool {
	changed := false
	if cur.Kind == "" && seed.Kind != "" {
		cur.Kind, changed = seed.Kind, true
	}
	if cur.Group == "" && seed.Group != "" {
		cur.Group, changed = seed.Group, true
	}
	if cur.Grade == "" && seed.Grade != "" {
		cur.Grade, changed = seed.Grade, true
	}
	if len(cur.Features) == 0 && len(seed.Features) > 0 {
		cur.Features, changed = append([]string(nil), seed.Features...), true
	}
	if cur.SortOrder == 0 && seed.SortOrder != 0 {
		cur.SortOrder, changed = seed.SortOrder, true
	}
	if changed && seed.OpenForRegistration {
		cur.OpenForRegistration = true
	}
	return changed
}
