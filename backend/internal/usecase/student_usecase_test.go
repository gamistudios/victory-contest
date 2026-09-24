package usecase

import (
	"errors"
	"testing"
	"time"
	"victory-contest-go/internal/domain"
)

// stubStudentRepo implements only the two student getters the premium-enrichment
// path needs; the remainder of the (large) StudentRepository is satisfied by
// embedding the interface. It returns a fresh shallow copy on every call so a
// test may invoke a getter more than once without the previous call's mutation
// of ReadNotifications/IsPremium leaking into the next.
type stubStudentRepo struct {
	StudentRepository
	byID       map[string]*domain.Student
	byTelegram map[string]*domain.Student
	list       []*domain.Student
	repoErr    error // simulates a failure of the student-table lookup itself
}

func cloneForTest(st *domain.Student) *domain.Student {
	cp := *st
	cp.ReadNotifications = nil // enrichment re-initializes this
	cp.IsPremium = false       // enrichment re-derives this from payments
	return &cp
}

func (s *stubStudentRepo) GetStudentByID(id string) (*domain.Student, error) {
	if s.repoErr != nil {
		return nil, s.repoErr
	}
	if st, ok := s.byID[id]; ok {
		return cloneForTest(st), nil
	}
	return nil, nil
}

func (s *stubStudentRepo) GetStudentByTelegramID(telegramID string) (*domain.Student, error) {
	if s.repoErr != nil {
		return nil, s.repoErr
	}
	if st, ok := s.byTelegram[telegramID]; ok {
		return cloneForTest(st), nil
	}
	return nil, nil
}

// GetStudents returns a fresh slice whose rows carry the stale stored
// is_premium attribute (the stub presets it to true) so tests prove the
// usecase overwrites it rather than passing it through.
func (s *stubStudentRepo) GetStudents() ([]domain.Student, error) {
	if s.repoErr != nil {
		return nil, s.repoErr
	}
	out := make([]domain.Student, 0, len(s.list))
	for _, st := range s.list {
		cp := *st
		cp.IsPremium = true
		out = append(out, cp)
	}
	return out, nil
}

// stubPaymentRepo implements the two payment reads the enrichment paths call
// (ListByUser for one student, ListAll for the student list) and can be told to
// fail them to exercise the non-fatal-error path.
type stubPaymentRepo struct {
	PaymentRepository
	byUser map[string][]domain.PaymentRequest
	all    []domain.PaymentRequest
	err    error
	calls  int
}

func (p *stubPaymentRepo) ListByUser(userID string) ([]domain.PaymentRequest, error) {
	p.calls++
	if p.err != nil {
		return nil, p.err
	}
	return p.byUser[userID], nil
}

func (p *stubPaymentRepo) ListAll() ([]domain.PaymentRequest, error) {
	p.calls++
	if p.err != nil {
		return nil, p.err
	}
	return p.all, nil
}

func ptrTime(t time.Time) *time.Time { return &t }

// studentFixture is the one student shared by these tests: DB id "student-1",
// telegram id "999001". Payments are keyed by the DB id (student.ID), matching
// the real ListByUser(user_id) attribute.
func studentFixture() *domain.Student {
	return &domain.Student{ID: "student-1", TelegramID: "999001", Name: "Test Student"}
}

func futureTime() time.Time { return time.Now().UTC().Add(24 * time.Hour) }
func pastTime() time.Time   { return time.Now().UTC().Add(-24 * time.Hour) }

// (1) README #8 regression: a Pending-but-unexpired payment must NOT grant
// premium via GetStudentByTelegramID. The pre-fix code granted premium to any
// unexpired payment regardless of status (and used time.Local), so a Pending
// payment leaked IsPremium=true. This test fails against the old logic.
func TestGetStudentByTelegramIDPendingPaymentIsNotPremium(t *testing.T) {
	repo := &stubStudentRepo{
		byTelegram: map[string]*domain.Student{"999001": studentFixture()},
	}
	pay := &stubPaymentRepo{byUser: map[string][]domain.PaymentRequest{
		"student-1": {
			{UserID: "student-1", Status: domain.StatusPending, ExpirationDate: ptrTime(futureTime())},
		},
	}}
	uc := NewStudentUsecase(repo, pay, nil, nil)

	student, err := uc.GetStudentByTelegramID("999001")
	if err != nil {
		t.Fatalf("GetStudentByTelegramID returned unexpected error: %v", err)
	}
	if student == nil {
		t.Fatal("expected a student record, got nil")
	}
	if student.IsPremium {
		t.Fatal("pending-but-unexpired payment must NOT grant premium (README #8)")
	}
	if student.ReadNotifications == nil {
		t.Fatal("ReadNotifications must be initialized even for non-premium students")
	}
}

// (2) An Approved, unexpired payment grants premium — via BOTH getters, proving
// the shared helper's rule. An Approved-but-expired payment does not.
func TestApprovedPaymentGrantsPremiumViaBothGetters(t *testing.T) {
	tests := []struct {
		name   string
		status domain.PaymentStatus
		exp    time.Time
		want   bool
	}{
		{"approved unexpired -> premium", domain.StatusApproved, futureTime(), true},
		{"approved expired -> not premium", domain.StatusApproved, pastTime(), false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			byTg := map[string]*domain.Student{"999001": studentFixture()}
			byID := map[string]*domain.Student{"student-1": studentFixture()}
			pay := &stubPaymentRepo{byUser: map[string][]domain.PaymentRequest{
				"student-1": {{UserID: "student-1", Status: tc.status, ExpirationDate: ptrTime(tc.exp)}},
			}}
			uc := NewStudentUsecase(&stubStudentRepo{byTelegram: byTg, byID: byID}, pay, nil, nil)

			byTgGot, err := uc.GetStudentByTelegramID("999001")
			if err != nil {
				t.Fatalf("GetStudentByTelegramID: %v", err)
			}
			if byTgGot.IsPremium != tc.want {
				t.Fatalf("GetStudentByTelegramID IsPremium=%v, want %v", byTgGot.IsPremium, tc.want)
			}

			byIDGot, err := uc.GetStudentByID("student-1")
			if err != nil {
				t.Fatalf("GetStudentByID: %v", err)
			}
			if byIDGot.IsPremium != tc.want {
				t.Fatalf("GetStudentByID IsPremium=%v, want %v", byIDGot.IsPremium, tc.want)
			}
		})
	}
}

// (3) client #1 regression: a ListByUser failure must be NON-FATAL. The student
// record callers actually need is still returned, with no error, IsPremium=false.
// The pre-fix code returned (nil, err) here, turning a payment-table hiccup
// into a 500 for GET and for the DeleteStudent flow (which calls these getters).
func TestStudentReturnedWhenPaymentLookupFails(t *testing.T) {
	lookupErr := errors.New("dynamodb: payment table unavailable")

	t.Run("GetStudentByID tolerates payment errors", func(t *testing.T) {
		repo := &stubStudentRepo{byID: map[string]*domain.Student{"student-1": studentFixture()}}
		pay := &stubPaymentRepo{err: lookupErr}
		uc := NewStudentUsecase(repo, pay, nil, nil)

		student, err := uc.GetStudentByID("student-1")
		if err != nil {
			t.Fatalf("expected non-fatal enrichment, got error: %v", err)
		}
		if student == nil {
			t.Fatal("student record must still be returned when payments fail")
		}
		if student.IsPremium {
			t.Fatal("IsPremium must be false when the payment lookup failed")
		}
		if student.ReadNotifications == nil {
			t.Fatal("ReadNotifications must still be initialized when payments fail")
		}
	})

	t.Run("GetStudentByTelegramID tolerates payment errors", func(t *testing.T) {
		repo := &stubStudentRepo{byTelegram: map[string]*domain.Student{"999001": studentFixture()}}
		pay := &stubPaymentRepo{err: lookupErr}
		uc := NewStudentUsecase(repo, pay, nil, nil)

		student, err := uc.GetStudentByTelegramID("999001")
		if err != nil {
			t.Fatalf("expected non-fatal enrichment, got error: %v", err)
		}
		if student == nil {
			t.Fatal("student record must still be returned when payments fail (delete flow depends on this)")
		}
		if student.IsPremium {
			t.Fatal("IsPremium must be false when the payment lookup failed")
		}
	})
}

// Scope guard: the student-table (repo) error is still fatal — only the payment
// enrichment was made non-fatal. A genuine "student not found" repo error must
// propagate so the handler can act on it.
func TestStudentRepoErrorStillPropagates(t *testing.T) {
	repoErr := errors.New("dynamodb: student table unavailable")
	repo := &stubStudentRepo{repoErr: repoErr}
	uc := NewStudentUsecase(repo, &stubPaymentRepo{}, nil, nil)

	if got, err := uc.GetStudentByID("student-1"); err == nil {
		t.Fatalf("expected repo error to propagate, got student %+v, nil", got)
	}
	if got, err := uc.GetStudentByTelegramID("999001"); err == nil {
		t.Fatalf("expected repo error to propagate, got student %+v, nil", got)
	}
}

// The admin user list must report the same premium derivation the single-student
// getters do. The stored is_premium attribute is only ever written on
// registration, so passing it through showed every paid student as unpaid (the
// stub presets it to true to prove it is overwritten).
func TestGetStudentsDerivesPremiumFromPayments(t *testing.T) {
	repo := &stubStudentRepo{list: []*domain.Student{
		{ID: "paid", TelegramID: "111", Name: "Paid"},
		{ID: "expired", TelegramID: "222", Name: "Expired"},
		{ID: "none", TelegramID: "333", Name: "None"},
	}}
	pay := &stubPaymentRepo{all: []domain.PaymentRequest{
		{UserID: "paid", Status: domain.StatusApproved, ExpirationDate: ptrTime(futureTime())},
		{UserID: "expired", Status: domain.StatusApproved, ExpirationDate: ptrTime(pastTime())},
		{UserID: "none", Status: domain.StatusPending, ExpirationDate: ptrTime(futureTime())},
	}}
	uc := NewStudentUsecase(repo, pay, nil, nil)

	students, err := uc.GetStudents()
	if err != nil {
		t.Fatalf("GetStudents: %v", err)
	}
	want := map[string]bool{"paid": true, "expired": false, "none": false}
	if len(students) != len(want) {
		t.Fatalf("got %d students, want %d", len(students), len(want))
	}
	for _, st := range students {
		if st.IsPremium != want[st.ID] {
			t.Errorf("%s: IsPremium=%v, want %v", st.ID, st.IsPremium, want[st.ID])
		}
	}
	if pay.calls != 1 {
		t.Errorf("expected one payment read for the whole list, got %d", pay.calls)
	}
}

// Rows written before the expiration attribute existed unmarshal with a nil
// ExpirationDate; dereferencing them panicked the read paths.
func TestGrantsAccessToleratesMissingExpiration(t *testing.T) {
	now := time.Now().UTC()
	if grantsAccess(domain.PaymentRequest{Status: domain.StatusApproved}, now) {
		t.Fatal("an approved payment without an expiration must not grant access")
	}
	if !grantsAccess(domain.PaymentRequest{Status: domain.StatusApproved, ExpirationDate: ptrTime(now.Add(time.Hour))}, now) {
		t.Fatal("an approved unexpired payment must grant access")
	}
}
