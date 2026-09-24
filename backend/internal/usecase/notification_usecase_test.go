package usecase

import (
	"errors"
	"testing"

	"victory-contest-go/internal/domain"
)

// fakeNotificationRepo embeds the NotificationRepository interface and only
// implements what MarkNotificationAsRead needs (see telegram_usecase_test.go
// for the fake style).
type fakeNotificationRepo struct {
	NotificationRepository
	byID    map[string]*domain.Notification
	updated []domain.Notification
}

func (f *fakeNotificationRepo) GetNotificationByID(id string) (*domain.Notification, error) {
	if n, ok := f.byID[id]; ok {
		return n, nil
	}
	// Mirrors the DynamoDB repo: missing item -> (nil, nil), no error.
	return nil, nil
}

func (f *fakeNotificationRepo) UpdateNotification(id string, update domain.Notification) error {
	f.updated = append(f.updated, update)
	return nil
}

func (f *fakeNotificationRepo) GetNotificationsByRecipient(recipientID string) ([]domain.Notification, error) {
	var out []domain.Notification
	for _, n := range f.byID {
		if n.RecipientID == recipientID || n.RecipientID == "all" {
			out = append(out, *n)
		}
	}
	return out, nil
}

// TestNotificationsNewestFirst covers the client report that fresh
// notifications appeared at the bottom: sent_at strings mix UTC ("Z") and
// "+03:00" offsets, so the API must order by parsed instant, not raw string.
func TestNotificationsNewestFirst(t *testing.T) {
	repo := &fakeNotificationRepo{byID: map[string]*domain.Notification{
		"old":  {ID: "old", RecipientID: "s1", SentAt: "2026-09-23T05:07:11Z"},
		"new":  {ID: "new", RecipientID: "all", SentAt: "2026-09-23T11:08:46+03:00"},
		"mid":  {ID: "mid", RecipientID: "s1", SentAt: "2026-09-23T09:00:00Z"},
		"junk": {ID: "junk", RecipientID: "s1", SentAt: "not-a-date"},
	}}
	u := &notificationUsecase{repo: repo}

	got, err := u.GetNotificationsByRecipient("s1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// "new" is 08:08 UTC despite its later-looking "+03:00" wall clock, so a
	// naive string sort would wrongly place it above "mid".
	want := []string{"mid", "new", "old", "junk"}
	if len(got) != len(want) {
		t.Fatalf("got %d notifications, want %d", len(got), len(want))
	}
	for i, id := range want {
		if got[i].ID != id {
			t.Fatalf("order = %v, want %v", ids(got), want)
		}
	}
}

func ids(ns []domain.Notification) []string {
	out := make([]string, len(ns))
	for i, n := range ns {
		out[i] = n.ID
	}
	return out
}

// TestMarkNotificationAsRead covers #30: an unknown id must produce
// ErrNotificationNotFound (mapped to 404 by the handler) instead of a nil
// dereference, while a known id is marked read and persisted.
func TestMarkNotificationAsRead(t *testing.T) {
	tests := []struct {
		name        string
		repo        *fakeNotificationRepo
		id          string
		wantErr     error
		wantUpdated int
		wantIsRead  bool
	}{
		{
			name:        "unknown id returns ErrNotificationNotFound, no update",
			repo:        &fakeNotificationRepo{byID: map[string]*domain.Notification{}},
			id:          "does-not-exist",
			wantErr:     ErrNotificationNotFound,
			wantUpdated: 0,
		},
		{
			name: "known id is marked read and persisted",
			repo: &fakeNotificationRepo{byID: map[string]*domain.Notification{
				"n1": {ID: "n1", RecipientID: "s1", Title: "hi", IsRead: false},
			}},
			id:          "n1",
			wantErr:     nil,
			wantUpdated: 1,
			wantIsRead:  true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			u := &notificationUsecase{repo: tc.repo}
			err := u.MarkNotificationAsRead(tc.id)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("MarkNotificationAsRead(%q) err = %v, want %v", tc.id, err, tc.wantErr)
			}
			if len(tc.repo.updated) != tc.wantUpdated {
				t.Fatalf("updated %d notifications, want %d", len(tc.repo.updated), tc.wantUpdated)
			}
			if tc.wantUpdated == 1 && !tc.repo.updated[0].IsRead {
				t.Fatal("persisted notification should have IsRead=true")
			}
		})
	}
}
