package usecase

import (
	"errors"
	"testing"

	"victor-contest-go/internal/domain"
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
