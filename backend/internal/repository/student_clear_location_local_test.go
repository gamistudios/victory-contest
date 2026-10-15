package repository

import (
	"testing"
	"time"
	"victory-contest-go/internal/domain"
)

// Unlinking a student has to take region_id and city_id OFF the row, which is
// something UpdateStudent cannot express: it skips zero-valued fields, so an
// empty id reads as "not provided". This is the assertion the admin's unlink
// depends on, on the production (id HASH, telegram_id RANGE) key shape.
func TestLocalDynamoClearStudentLocationOnProdKeyShape(t *testing.T) {
	client := localDynamoClient(t)
	ensureProdKeyStudentTable(t, client)
	repo := NewStudentDynamoRepository(client, prodKeyStudentTable)

	suffix := itoa(time.Now().UnixNano())
	id := "it-unlink-" + suffix
	tele := "91" + suffix
	if err := repo.AddStudent(domain.Student{
		ID: id, TelegramID: tele, Name: "Kalkidan", Grade: "11",
		RegionID: "oromia", Region: "Oromia", CityID: "adama", City: "Adama",
		CreatedAt: time.Now().UTC().Truncate(time.Second),
	}); err != nil {
		t.Fatalf("AddStudent: %v", err)
	}
	defer func() { _ = repo.DeleteStudent(id) }()

	// The patch path proves it cannot clear: sending empty ids leaves the row as
	// it was, which is why the unlink needs its own write.
	if err := repo.UpdateStudent(domain.Student{ID: id, TelegramID: tele, RegionID: "", CityID: ""}); err != nil {
		t.Fatalf("UpdateStudent: %v", err)
	}
	got, err := repo.GetStudentByID(id)
	if err != nil || got == nil {
		t.Fatalf("read back: %v %+v", err, got)
	}
	if got.RegionID != "oromia" || got.CityID != "adama" {
		t.Fatalf("a zero-valued patch unexpectedly cleared the link: %+v", got)
	}

	if err := repo.ClearStudentLocation(id, tele); err != nil {
		t.Fatalf("ClearStudentLocation: %v", err)
	}
	got, err = repo.GetStudentByID(id)
	if err != nil || got == nil {
		t.Fatalf("read back after unlink: %v %+v", err, got)
	}
	if got.RegionID != "" || got.CityID != "" {
		t.Fatalf("the ids survived the unlink: %+v", got)
	}
	// The typed names stay, because that is what puts the student back in the
	// admin's free-text list instead of losing their location.
	if got.Region != "Oromia" || got.City != "Adama" {
		t.Fatalf("unlink wiped the typed names: %+v", got)
	}
	if got.TelegramID != tele {
		t.Fatalf("the range key was rewritten: %q", got.TelegramID)
	}
	if got.Name != "Kalkidan" || got.Grade != "11" {
		t.Fatalf("unlink clobbered unrelated fields: %+v", got)
	}

	// Idempotent: clearing a row that is already unlinked is not an error.
	if err := repo.ClearStudentLocation(id, tele); err != nil {
		t.Fatalf("second unlink: %v", err)
	}
	// Only the given row is touched.
	other := "it-unlink-keep-" + suffix
	if err := repo.AddStudent(domain.Student{
		ID: other, TelegramID: "92" + suffix, RegionID: "sidama", Region: "Sidama",
		CityID: "hawassa", City: "Hawassa", CreatedAt: time.Now().UTC().Truncate(time.Second),
	}); err != nil {
		t.Fatalf("AddStudent(other): %v", err)
	}
	defer func() { _ = repo.DeleteStudent(other) }()
	if kept, err := repo.GetStudentByID(other); err != nil || kept == nil || kept.CityID != "hawassa" {
		t.Fatalf("the neighbour row changed: %v %+v", err, kept)
	}
}
