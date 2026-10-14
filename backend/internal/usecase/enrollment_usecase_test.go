package usecase

import (
	"errors"
	"testing"

	"victory-contest-go/internal/domain"
)

type fakeStudents struct {
	StudentRepository
	st map[string]*domain.Student
}

func (f *fakeStudents) GetStudentByID(id string) (*domain.Student, error) { return f.st[id], nil }
func (f *fakeStudents) UpdateStudent(s domain.Student) error {
	cur := f.st[s.ID]
	if s.PrimaryProgramID != "" {
		cur.PrimaryProgramID = s.PrimaryProgramID
	}
	if len(s.Enrollments) > 0 {
		cur.Enrollments = s.Enrollments
	}
	return nil
}

func testPrograms() ([]domain.AcademyProgram, error) {
	return []domain.AcademyProgram{
		{ID: "grade-12", IsActive: true, OpenForRegistration: true, AvailableStreams: []string{"natural", "social"}},
		{ID: "training", IsActive: true, OpenForRegistration: false},
	}, nil
}

func newEnrollFixture() (*EnrollmentUsecase, *fakeStudents) {
	f := &fakeStudents{st: map[string]*domain.Student{"s1": {ID: "s1"}}}
	return NewEnrollmentUsecase(f, testPrograms), f
}

func TestEnrollSelfRespectsRegistrationAndStream(t *testing.T) {
	u, f := newEnrollFixture()
	if _, err := u.Enroll("s1", "training", "", true); !errors.Is(err, ErrProgramClosed) {
		t.Fatalf("closed program: got %v", err)
	}
	if _, err := u.Enroll("s1", "grade-12", "", true); !errors.Is(err, ErrStreamRequired) {
		t.Fatalf("stream required: got %v", err)
	}
	if _, err := u.Enroll("s1", "grade-12", "natural", true); err != nil {
		t.Fatal(err)
	}
	if f.st["s1"].PrimaryProgramID != "grade-12" {
		t.Fatal("first enrollment must become primary")
	}
	if _, err := u.Enroll("s1", "grade-12", "natural", true); !errors.Is(err, ErrAlreadyEnrolled) {
		t.Fatalf("duplicate: got %v", err)
	}
}

func TestAdminCanEnrollClosedProgramAndLastCannotLeave(t *testing.T) {
	u, _ := newEnrollFixture()
	if _, err := u.Enroll("s1", "training", "", false); err != nil {
		t.Fatal(err)
	}
	if _, err := u.Leave("s1", "training"); !errors.Is(err, ErrLastEnrollment) {
		t.Fatalf("last enrollment: got %v", err)
	}
}

func TestSelfStreamChangeLockedOnceConfirmed(t *testing.T) {
	u, _ := newEnrollFixture()
	if _, err := u.Enroll("s1", "grade-12", "natural", true); err != nil {
		t.Fatal(err)
	}
	if _, err := u.SetStream("s1", "grade-12", "social", true); err == nil {
		t.Fatal("confirmed stream must be locked for students")
	}
	if _, err := u.SetStream("s1", "grade-12", "social", false); err != nil {
		t.Fatalf("admin may change stream: %v", err)
	}
}
