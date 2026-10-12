package usecase

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"log"

	"victory-contest-go/internal/domain"
)

// academySeedJSON is the initial Victory Academy catalogue (programs, streams,
// subjects, chapters, modules). It is written once into an empty content
// table by SeedIfEmpty.
//
//go:embed academy_seed.json
var academySeedJSON []byte

const academySeedMarker = "seed_v1"

type academySeedFile struct {
	Programs []domain.AcademyProgram `json:"programs"`
	Streams  []domain.AcademyStream  `json:"streams"`
	Subjects []domain.AcademySubject `json:"subjects"`
	Chapters []domain.AcademyChapter `json:"chapters"`
	Modules  []domain.AcademyModule  `json:"modules"`
}

// SeedIfEmpty is the Academy data migration. It is idempotent and safe to run
// on every boot and from several instances at once:
//   - every document is written with attribute_not_exists, so an admin's edits
//     are never overwritten;
//   - the "seed_v1" marker is written LAST, so an interrupted run is simply
//     retried on the next boot, and once it exists the seed never runs again
//     (an admin deleting seeded content does not resurrect it).
func (u *AcademyUsecase) SeedIfEmpty() error {
	docs, err := u.repo.ListContent()
	if err != nil {
		return fmt.Errorf("academy seed: list content: %w", err)
	}
	for _, d := range docs {
		if d.Kind == academyKindMeta && d.ID == academySeedMarker {
			return nil // already seeded
		}
	}

	var seed academySeedFile
	if err := json.Unmarshal(academySeedJSON, &seed); err != nil {
		return fmt.Errorf("academy seed: embedded seed is corrupt: %w", err)
	}

	written := 0
	put := func(kind, id string, v any) error {
		b, err := json.Marshal(v)
		if err != nil {
			return err
		}
		ok, err := u.repo.PutContentIfAbsent(kind, id, b)
		if err != nil {
			return fmt.Errorf("academy seed: put %s %s: %w", kind, id, err)
		}
		if ok {
			written++
		}
		return nil
	}

	for _, p := range seed.Programs {
		if err := put(academyKindProgram, p.ID, p); err != nil {
			return err
		}
	}
	for _, s := range seed.Streams {
		if err := put(academyKindStream, s.ID, s); err != nil {
			return err
		}
	}
	for _, s := range seed.Subjects {
		if err := put(academyKindSubject, s.ID, s); err != nil {
			return err
		}
	}
	for _, c := range seed.Chapters {
		c.ModuleIDs = nil // derived on read
		if err := put(academyKindChapter, c.ID, c); err != nil {
			return err
		}
	}
	now := academyNow()
	for _, m := range seed.Modules {
		normalizeAcademyModule(&m)
		if m.CreatedAt == "" {
			m.CreatedAt = now
		}
		if m.UpdatedAt == "" {
			m.UpdatedAt = now
		}
		if err := put(academyKindModule, m.ID, m); err != nil {
			return err
		}
	}
	if err := put(academyKindMeta, academySeedMarker, map[string]string{"seeded_at": now}); err != nil {
		return err
	}
	u.invalidate()
	log.Printf("academy: seeded catalogue (%d programs, %d subjects, %d chapters, %d modules; %d documents written)",
		len(seed.Programs), len(seed.Subjects), len(seed.Chapters), len(seed.Modules), written)
	return nil
}
