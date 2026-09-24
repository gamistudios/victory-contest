package usecase

import (
	"errors"
	"fmt"
	"testing"
	"time"
	"victory-contest-go/internal/domain"
)

// fakeRegistrationRepo embeds the ContestRegistrationRepository interface and
// implements only what the registration usecase needs. It can simulate real
// concurrency outcomes: a conditional update failing because the row was
// deleted (or activated) by a concurrent operation between read and write.
type fakeRegistrationRepo struct {
	ContestRegistrationRepository
	rows map[string]*domain.ContestRegistration // keyed contest|student

	getErr        error  // surfaces as a repository read failure
	updateErr     error  // generic (non-conditional) write failure
	failNextWrite int    // N leading conditional-write failures
	beforeWrite   func() // e.g. activate/delete the row behind our back
	ranBefore     bool

	activateCalls int
	added         []domain.ContestRegistration
}

func regKey(contestID, studentID string) string { return contestID + "|" + studentID }

func (f *fakeRegistrationRepo) GetRegistrationsByContestAndStudent(contestID, studentID string) (*domain.ContestRegistration, error) {
	if f.getErr != nil {
		return nil, f.getErr
	}
	r, ok := f.rows[regKey(contestID, studentID)]
	if !ok {
		return nil, nil
	}
	copied := *r
	return &copied, nil
}

func (f *fakeRegistrationRepo) UpdateContestRegistrationIfExist(registration domain.ContestRegistration) error {
	f.activateCalls++
	if f.beforeWrite != nil && !f.ranBefore {
		f.ranBefore = true
		f.beforeWrite()
	}
	if f.updateErr != nil {
		return f.updateErr
	}
	if f.failNextWrite > 0 {
		f.failNextWrite--
		return fmt.Errorf("%w: registration %s", ErrConditionalCheckFailed, registration.ID)
	}
	stored, ok := f.rows[regKey(registration.ContestID, registration.StudentID)]
	if !ok {
		// row vanished: behaves like the DynamoDB attribute_exists(id) guard
		return fmt.Errorf("%w: registration %s", ErrConditionalCheckFailed, registration.ID)
	}
	*stored = registration
	return nil
}

func (f *fakeRegistrationRepo) AddContestRegistration(registration domain.ContestRegistration) (string, error) {
	f.added = append(f.added, registration)
	f.rows[regKey(registration.ContestID, registration.StudentID)] = &registration
	return registration.ID, nil
}

func newInactiveRepo() *fakeRegistrationRepo {
	return &fakeRegistrationRepo{
		rows: map[string]*domain.ContestRegistration{
			regKey("c1", "s1"): {ID: "r1", ContestID: "c1", StudentID: "s1", IsActive: false, RegisteredAt: time.Now()},
		},
	}
}

func TestCheckStudentActiveInContestActivatesOnce(t *testing.T) {
	repo := newInactiveRepo()
	uc := &contestRegistrationUsecase{repo: repo}

	active, err := uc.CheckStudentActiveInContest("c1", "s1")
	if err != nil {
		t.Fatalf("first activation: %v", err)
	}
	if active == nil || !*active {
		t.Fatalf("expected active=true, got %v", active)
	}
	if repo.activateCalls != 1 {
		t.Fatalf("activateCalls = %d, want 1", repo.activateCalls)
	}

	// Second call is the "re-enter a contest I already joined" path — it
	// must succeed without another write (the student-facing gate bounces
	// on any error, so already-active is NOT a failure).
	active2, err := uc.CheckStudentActiveInContest("c1", "s1")
	if err != nil {
		t.Fatalf("second activation (already active) err = %v, want nil", err)
	}
	if active2 == nil || !*active2 {
		t.Fatalf("expected active=true on re-entry, got %v", active2)
	}
	if repo.activateCalls != 1 {
		t.Fatalf("activateCalls = %d, want still 1 (no write for an active row)", repo.activateCalls)
	}
}

func TestCheckStudentActiveInContestNotRegistered(t *testing.T) {
	repo := newInactiveRepo()
	uc := &contestRegistrationUsecase{repo: repo}

	if _, err := uc.CheckStudentActiveInContest("c1", "ghost"); !errors.Is(err, ErrNotRegisteredForContest) {
		t.Fatalf("err = %v, want ErrNotRegisteredForContest", err)
	}
}

func TestCheckStudentActiveInContestPropagatesRealFailures(t *testing.T) {
	t.Run("read failure is not masked as not-registered", func(t *testing.T) {
		boom := errors.New("dynamodb unreachable")
		repo := newInactiveRepo()
		repo.getErr = boom
		uc := &contestRegistrationUsecase{repo: repo}

		if _, err := uc.CheckStudentActiveInContest("c1", "s1"); !errors.Is(err, boom) {
			t.Fatalf("err = %v, want wrapped %v", err, boom)
		}
	})

	t.Run("update failure surfaces instead of silent success", func(t *testing.T) {
		boom := errors.New("put failed")
		repo := newInactiveRepo()
		repo.updateErr = boom
		uc := &contestRegistrationUsecase{repo: repo}

		if _, err := uc.CheckStudentActiveInContest("c1", "s1"); !errors.Is(err, boom) {
			t.Fatalf("err = %v, want %v (never a swallowed nil)", err, boom)
		}
		if repo.activateCalls != 1 {
			t.Fatalf("generic write errors must not be retried, calls = %d", repo.activateCalls)
		}
	})
}

func TestCheckStudentActiveInContestConflictRetry(t *testing.T) {
	t.Run("concurrent activation wins -> already registered, single entry", func(t *testing.T) {
		repo := newInactiveRepo()
		// Simulate the winner of the race: the row goes active right before
		// our conditional write, which then fails the attribute check for a
		// second caller.
		repo.beforeWrite = func() {
			repo.rows[regKey("c1", "s1")].IsActive = true
			repo.failNextWrite = 1
		}
		uc := &contestRegistrationUsecase{repo: repo}

		// Losing the race now converges on success: the re-read sees the
		// winner's active row and returns it.
		active, err := uc.CheckStudentActiveInContest("c1", "s1")
		if err != nil {
			t.Fatalf("err = %v, want nil after losing the race (already active)", err)
		}
		if active == nil || !*active {
			t.Fatalf("expected active=true, got %v", active)
		}
		if repo.activateCalls != 1 {
			t.Fatalf("activateCalls = %d, want 1 (retry must stop at the re-read)", repo.activateCalls)
		}
		if n := len(repo.rows); n != 1 {
			t.Fatalf("registration entries = %d, want exactly 1", n)
		}
	})

	t.Run("row deleted mid-flight -> surfaces, never resurrects or silently succeeds", func(t *testing.T) {
		repo := newInactiveRepo()
		repo.beforeWrite = func() {
			delete(repo.rows, regKey("c1", "s1"))
		}
		uc := &contestRegistrationUsecase{repo: repo}

		if _, err := uc.CheckStudentActiveInContest("c1", "s1"); !errors.Is(err, ErrNotRegisteredForContest) {
			t.Fatalf("err = %v, want ErrNotRegisteredForContest for a deleted row", err)
		}
		if _, ok := repo.rows[regKey("c1", "s1")]; ok {
			t.Fatal("conditional write must not resurrect the deleted row")
		}
	})

	t.Run("persistent conflict retries max 2 then errors", func(t *testing.T) {
		repo := newInactiveRepo()
		repo.failNextWrite = 5
		uc := &contestRegistrationUsecase{repo: repo}

		_, err := uc.CheckStudentActiveInContest("c1", "s1")
		if err == nil {
			t.Fatal("expected error after exhausting retries, got nil (silent success)")
		}
		if !errors.Is(err, ErrConditionalCheckFailed) {
			t.Fatalf("err = %v, want wrapping ErrConditionalCheckFailed", err)
		}
		if repo.activateCalls != activationAttempts {
			t.Fatalf("activateCalls = %d, want %d", repo.activateCalls, activationAttempts)
		}
	})
}

func TestAddContestRegistrationRejectsDuplicates(t *testing.T) {
	repo := newInactiveRepo()
	uc := &contestRegistrationUsecase{repo: repo}

	// Same (contest, student) pair already exists -> conflict, no new row.
	if _, err := uc.AddContestRegistration(domain.ContestRegistrationDto{ContestID: "c1", StudentID: "s1"}); !errors.Is(err, ErrAlreadyRegisteredForContest) {
		t.Fatalf("duplicate add err = %v, want ErrAlreadyRegisteredForContest", err)
	}
	if len(repo.added) != 0 {
		t.Fatalf("duplicate add wrote %d rows, want 0", len(repo.added))
	}

	// A new pair still registers.
	id, err := uc.AddContestRegistration(domain.ContestRegistrationDto{ContestID: "c1", StudentID: "s2"})
	if err != nil || id == "" {
		t.Fatalf("fresh add: id=%q err=%v", id, err)
	}
}
