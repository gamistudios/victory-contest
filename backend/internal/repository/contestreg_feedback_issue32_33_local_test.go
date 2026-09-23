package repository

import (
	"errors"
	"testing"
	"time"
	"victor-contest-go/internal/domain"
	"victor-contest-go/internal/usecase"
)

// Repo-level integration coverage for issues #32 and #33, run against the
// same dynalite endpoint as dynamo_local_test.go (skipped unless
// AWS_ENDPOINT_URL_DYNAMODB is set).

func TestLocalDynamoRegistrationConditionalUpdate(t *testing.T) {
	client := localDynamoClient(t)
	repo := &ContestRegistrationDynamoRepository{db: client, tableName: "contest_registeration"}

	suffix := itoa(time.Now().UnixNano())
	regID := "it-reg-" + suffix
	contestID := "it-contest-" + suffix
	studentID := "it-student-" + suffix

	reg := domain.ContestRegistration{
		ID: regID, ContestID: contestID, StudentID: studentID,
		IsActive: false, RegisteredAt: time.Now(),
	}
	if _, err := repo.AddContestRegistration(reg); err != nil {
		t.Fatalf("AddContestRegistration: %v", err)
	}
	defer cleanupIDs(t, client, "contest_registeration", regID)

	// Conditional write on a live row succeeds and persists.
	reg.IsActive = true
	if err := repo.UpdateContestRegistrationIfExist(reg); err != nil {
		t.Fatalf("UpdateContestRegistrationIfExist on live row: %v", err)
	}
	got, err := repo.GetRegistrationsByContestAndStudent(contestID, studentID)
	if err != nil || got == nil || !got.IsActive {
		t.Fatalf("after conditional update: got %+v err %v", got, err)
	}

	// Issue #32: after a concurrent delete the guarded write must fail with
	// ErrConditionalCheckFailed instead of resurrecting the row (before: an
	// unguarded PutItem recreated deleted rows and the usecase ignored the
	// error anyway).
	if err := repo.DeleteContestRegistration(regID); err != nil {
		t.Fatalf("DeleteContestRegistration: %v", err)
	}
	err = repo.UpdateContestRegistrationIfExist(reg)
	if !errors.Is(err, usecase.ErrConditionalCheckFailed) {
		t.Fatalf("update after delete err = %v, want ErrConditionalCheckFailed", err)
	}
	if _, err := repo.GetRegistrationsByContestAndStudent(contestID, studentID); err != nil {
		t.Fatalf("query after delete: %v", err)
	}
}

func TestLocalDynamoDeleteContactByPhoneNumberClearsAll(t *testing.T) {
	client := localDynamoClient(t)
	repo := &FeedbackResponseDynamoRepository{db: client, tableName: "feedback_responses"}

	suffix := itoa(time.Now().UnixNano())
	sharedPhone := "+999000" + suffix
	otherPhone := "+999111" + suffix

	mk := func(id, phone, comment string) {
		r := domain.FeedbackResponse{
			ID: id, StudentID: "st-" + id, StudentName: "n-" + id,
			Comment: comment, SubmittedAt: time.Now(),
		}
		if phone != "" {
			r.ContactInfo = &domain.ContactInfo{PhoneNumber: phone, Language: "english", Score: 9}
		}
		if _, err := repo.AddFeedbackResponse(r); err != nil {
			t.Fatalf("AddFeedbackResponse %s: %v", id, err)
		}
	}
	shared1, shared2, other := "it-fb-1-"+suffix, "it-fb-2-"+suffix, "it-fb-3-"+suffix
	defer cleanupIDs(t, client, "feedback_responses", shared1, shared2, other)

	mk(shared1, sharedPhone, "first")
	mk(shared2, sharedPhone, "second") // two rows share the phone number
	mk(other, otherPhone, "untouched")

	if err := repo.DeleteContactByPhoneNumber(sharedPhone); err != nil {
		t.Fatalf("DeleteContactByPhoneNumber: %v", err)
	}

	// Issue #33 (before): the `return` inside the loop cleared only shared1.
	// After: every matching row loses contact_info while all other attributes
	// survive (UpdateItem REMOVE, not whole-item PutItem).
	for _, id := range []string{shared1, shared2} {
		r, err := repo.GetFeedbackResponseByID(id)
		if err != nil || r == nil {
			t.Fatalf("GetFeedbackResponseByID(%s): %v", id, err)
		}
		if r.ContactInfo != nil {
			t.Errorf("%s still has contact %+v, want cleared", id, r.ContactInfo)
		}
		if r.Comment == "" || r.StudentName == "" {
			t.Errorf("%s lost other attributes: %+v", id, r)
		}
	}
	r, err := repo.GetFeedbackResponseByID(other)
	if err != nil || r == nil || r.ContactInfo == nil || r.ContactInfo.PhoneNumber != otherPhone {
		t.Fatalf("non-matching response changed: %+v err %v", r, err)
	}

	// Re-running is idempotent (no matches, no error).
	if err := repo.DeleteContactByPhoneNumber(sharedPhone); err != nil {
		t.Errorf("second DeleteContactByPhoneNumber: %v", err)
	}
}
