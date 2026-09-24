package usecase

import (
	"errors"
	"fmt"
	"time"
	"victory-contest-go/internal/domain"
)

type ContestRegistrationUsecase interface {
	AddContestRegistration(registration domain.ContestRegistrationDto) (string, error)
	UpdateContestRegistration(id string, update domain.ContestRegistration) error
	DeleteContestRegistration(id string) error
	GetRegisterationForContest(contest_id string) ([]domain.ContestRegistration, error)
	CheckRegistrationsByContestAndStudent(contestID, studentID string) (bool, error)
	CheckStudentActiveInContest(contestId, studentId string) (*bool, error)
}

// Sentinel errors so the HTTP layer can map distinct outcomes:
// a duplicate activation is a client-visible conflict, a missing
// registration is a not-found, and anything else (repository/read/write
// failures) is a real server error — never a swallowed success.
var (
	ErrAlreadyRegisteredForContest = errors.New("the student is already registered for this contest")
	ErrNotRegisteredForContest     = errors.New("the user is not registered for the contest")
)

// conditionalRegistrationUpdater is implemented by repositories whose update
// is guarded by a ConditionExpression (attribute_exists(id)) and which map a
// ConditionalCheckFailedException to ErrConditionalCheckFailed. It is the
// same recipe the student badge flow uses (UpdateStudentIfExist): the write
// refuses to resurrect a row a concurrent delete removed, so the caller can
// re-read and retry instead of silently losing or ghosting the change.
type conditionalRegistrationUpdater interface {
	UpdateContestRegistrationIfExist(registration domain.ContestRegistration) error
}

// activationAttempts is how many read+conditional-write rounds
// CheckStudentActiveInContest makes before surfacing a persistent conflict.
const activationAttempts = 2

type contestRegistrationUsecase struct {
	repo ContestRegistrationRepository
}

// GetRegisterationForContest implements ContestRegistrationUsecase.
func (u *contestRegistrationUsecase) GetRegisterationForContest(contest_id string) ([]domain.ContestRegistration, error) {
	regiterations, err := u.repo.GetRegistrationsByContest(contest_id)
	if err != nil {
		return nil, err
	}
	return regiterations, nil
}

// CheckStudentActiveInContest activates the (contest, student) registration —
// one row per student/contest pair, so the write is a single-item update.
// The previous version ignored the update error entirely (a failed write
// still returned 200) and raced with concurrent deletes/activations. Now the
// write is conditional (via UpdateContestRegistrationIfExist when the repo
// supports it), errors are propagated, and a conditional-check failure
// triggers a re-read + retry (max activationAttempts rounds).
func (u *contestRegistrationUsecase) CheckStudentActiveInContest(contestId string, studentId string) (*bool, error) {
	var lastErr error
	for attempt := 0; attempt < activationAttempts; attempt++ {
		registration, err := u.repo.GetRegistrationsByContestAndStudent(contestId, studentId)
		if err != nil {
			return nil, err // repository failure, not "not registered"
		}
		if registration == nil {
			return nil, ErrNotRegisteredForContest
		}
		if registration.IsActive {
			// Re-entering a contest you already joined is normal — the
			// student-facing gate treats any error here as "you may not
			// enter", so already-active must succeed, not conflict.
			active := true
			return &active, nil
		}
		registration.IsActive = true
		err = u.activate(*registration)
		if err == nil {
			return &registration.IsActive, nil
		}
		lastErr = err
		if errors.Is(err, ErrConditionalCheckFailed) {
			continue // row changed under us — re-read and retry once
		}
		return nil, err // unguardable/other failure: surface it, never silently succeed
	}
	return nil, fmt.Errorf("could not activate contest %s for student %s after %d attempts: %w",
		contestId, studentId, activationAttempts, lastErr)
}

// activate writes the registration back through the conditional update when
// the repository provides one; otherwise it falls back to the plain update.
func (u *contestRegistrationUsecase) activate(registration domain.ContestRegistration) error {
	if cu, ok := u.repo.(conditionalRegistrationUpdater); ok {
		return cu.UpdateContestRegistrationIfExist(registration)
	}
	return u.repo.UpdateContestRegistration(registration.ID, registration)
}

func NewContestRegistrationUsecase(repo ContestRegistrationRepository) ContestRegistrationUsecase {
	return &contestRegistrationUsecase{repo: repo}
}

// AddContestRegistration rejects a duplicate registration for the same
// (contest, student) pair with ErrAlreadyRegisteredForContest (mapped to 409
// by the handler) instead of silently creating a second row.
func (u *contestRegistrationUsecase) AddContestRegistration(registrationDto domain.ContestRegistrationDto) (string, error) {
	existing, err := u.repo.GetRegistrationsByContestAndStudent(registrationDto.ContestID, registrationDto.StudentID)
	if err != nil {
		return "", err
	}
	if existing != nil {
		return "", ErrAlreadyRegisteredForContest
	}
	id := GenerateUniqueId()
	registration := domain.ContestRegistration{
		ContestID:    registrationDto.ContestID,
		StudentID:    registrationDto.StudentID,
		ID:           id,
		IsActive:     false,
		RegisteredAt: time.Now().In(time.Local),
	}
	return u.repo.AddContestRegistration(registration)
}

func (u *contestRegistrationUsecase) UpdateContestRegistration(id string, update domain.ContestRegistration) error {
	return u.repo.UpdateContestRegistration(id, update)
}

func (u *contestRegistrationUsecase) DeleteContestRegistration(id string) error {
	return u.repo.DeleteContestRegistration(id)
}

func (u *contestRegistrationUsecase) CheckRegistrationsByContestAndStudent(contestID, studentID string) (bool, error) {
	registered, err := u.repo.GetRegistrationsByContestAndStudent(contestID, studentID)
	if err != nil {
		return false, err
	}
	return registered != nil, nil
}
