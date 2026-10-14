package usecase

import (
	"errors"
	"time"

	"victory-contest-go/internal/domain"
)

var (
	ErrAlreadyEnrolled  = errors.New("already enrolled in this program")
	ErrNotEnrolled      = errors.New("not enrolled in this program")
	ErrLastEnrollment   = errors.New("cannot leave your only program")
	ErrSuspendedStudent = errors.New("student is suspended")
)

// EnrollmentUsecase owns Student.Enrollments / PrimaryProgramID (plan §5.2).
// Students enrol themselves only in programs open for registration; admins can
// enrol into any active program. Entitlements (payment) are independent: being
// enrolled never unlocks premium content.
type EnrollmentUsecase struct {
	students  StudentRepository
	programs  func() ([]domain.AcademyProgram, error)
	now       func() time.Time
	locations func() domain.Locations // nil = embedded seed
}

// WithLocations makes registration validate against the admin-managed list.
func (u *EnrollmentUsecase) WithLocations(f func() domain.Locations) *EnrollmentUsecase {
	u.locations = f
	return u
}

func NewEnrollmentUsecase(students StudentRepository, programs func() ([]domain.AcademyProgram, error)) *EnrollmentUsecase {
	return &EnrollmentUsecase{students: students, programs: programs, now: time.Now}
}

func (u *EnrollmentUsecase) load(id string) (*domain.Student, error) {
	st, err := u.students.GetStudentByID(id)
	if err != nil || st == nil {
		return nil, ErrStudentNotFound
	}
	return st, nil
}

func (u *EnrollmentUsecase) build(programID, streamID, source string, requireOpen bool) (domain.Enrollment, error) {
	progs, err := u.programs()
	if err != nil {
		return domain.Enrollment{}, err
	}
	stream, err := ValidateEnrollment(progs, programID, streamID, requireOpen)
	if err != nil {
		return domain.Enrollment{}, err
	}
	return domain.Enrollment{ProgramID: programID, StreamID: stream,
		EnrolledAt: u.now().UTC().Format(time.RFC3339), Source: source, Confirmed: true}, nil
}

// ForRegistration builds the first enrollment (+ validates the location pick)
// for a brand-new student. Called from AddStudent.
func (u *EnrollmentUsecase) ForRegistration(programID, streamID, regionID, cityID string) ([]domain.Enrollment, error) {
	e, err := u.build(programID, streamID, "self", true)
	if err != nil {
		return nil, err
	}
	if regionID != "" || cityID != "" {
		locs := DefaultLocations()
		if u.locations != nil {
			locs = u.locations()
		}
		if !locs.ValidatePick(regionID, cityID, "", "") {
			return nil, ErrInvalidLocation
		}
	}
	return []domain.Enrollment{e}, nil
}

// List returns the student's enrollments.
func (u *EnrollmentUsecase) List(studentID string) ([]domain.Enrollment, string, error) {
	st, err := u.load(studentID)
	if err != nil {
		return nil, "", err
	}
	return st.Enrollments, st.PrimaryProgramID, nil
}

// Enroll adds a program (self=true applies the open-for-registration rule).
func (u *EnrollmentUsecase) Enroll(studentID, programID, streamID string, self bool) ([]domain.Enrollment, error) {
	st, err := u.load(studentID)
	if err != nil {
		return nil, err
	}
	if st.IsSuspended && self {
		return nil, ErrSuspendedStudent
	}
	for _, e := range st.Enrollments {
		if e.ProgramID == programID {
			return nil, ErrAlreadyEnrolled
		}
	}
	src := "admin"
	if self {
		src = "self"
	}
	e, err := u.build(programID, streamID, src, self)
	if err != nil {
		return nil, err
	}
	upd := domain.Student{ID: st.ID, Enrollments: append(append([]domain.Enrollment(nil), st.Enrollments...), e)}
	if st.PrimaryProgramID == "" {
		upd.PrimaryProgramID = programID
	}
	return upd.Enrollments, u.students.UpdateStudent(upd)
}

// SetStream changes the stream of an existing enrollment (admin, or the
// student while the enrollment is unconfirmed - e.g. migrated defaults).
func (u *EnrollmentUsecase) SetStream(studentID, programID, streamID string, self bool) ([]domain.Enrollment, error) {
	st, err := u.load(studentID)
	if err != nil {
		return nil, err
	}
	out := append([]domain.Enrollment(nil), st.Enrollments...)
	found := false
	for i := range out {
		if out[i].ProgramID != programID {
			continue
		}
		if self && out[i].Confirmed {
			return nil, errors.New("stream is locked; ask an admin to change it")
		}
		ne, err := u.build(programID, streamID, out[i].Source, false)
		if err != nil {
			return nil, err
		}
		ne.EnrolledAt = out[i].EnrolledAt
		out[i], found = ne, true
	}
	if !found {
		return nil, ErrNotEnrolled
	}
	return out, u.students.UpdateStudent(domain.Student{ID: st.ID, Enrollments: out})
}

// Leave removes an enrollment; the last one cannot be removed.
func (u *EnrollmentUsecase) Leave(studentID, programID string) ([]domain.Enrollment, error) {
	st, err := u.load(studentID)
	if err != nil {
		return nil, err
	}
	var out []domain.Enrollment
	for _, e := range st.Enrollments {
		if e.ProgramID != programID {
			out = append(out, e)
		}
	}
	if len(out) == len(st.Enrollments) {
		return nil, ErrNotEnrolled
	}
	if len(out) == 0 {
		return nil, ErrLastEnrollment
	}
	upd := domain.Student{ID: st.ID, Enrollments: out}
	if st.PrimaryProgramID == programID {
		upd.PrimaryProgramID = out[0].ProgramID
	}
	return out, u.students.UpdateStudent(upd)
}

// SetPrimary switches the active program the app opens on.
func (u *EnrollmentUsecase) SetPrimary(studentID, programID string) error {
	st, err := u.load(studentID)
	if err != nil {
		return err
	}
	for _, e := range st.Enrollments {
		if e.ProgramID == programID {
			return u.students.UpdateStudent(domain.Student{ID: st.ID, PrimaryProgramID: programID})
		}
	}
	return ErrNotEnrolled
}

// BulkEnroll enrols many students (admin); returns per-student errors.
func (u *EnrollmentUsecase) BulkEnroll(studentIDs []string, programID, streamID string) map[string]string {
	failed := map[string]string{}
	for _, id := range studentIDs {
		if _, err := u.Enroll(id, programID, streamID, false); err != nil {
			failed[id] = err.Error()
		}
	}
	return failed
}
