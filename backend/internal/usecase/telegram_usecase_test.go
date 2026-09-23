package usecase

import (
	"testing"

	"victor-contest-go/internal/domain"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

// fakeStudentRepo embeds the (large) StudentRepository interface and only
// implements the methods the telegram usecase needs.
type fakeStudentRepo struct {
	StudentRepository
	studentsByTelegramID map[string]*domain.Student
	added                []domain.Student
}

func (f *fakeStudentRepo) GetStudentByTelegramID(telegramID string) (*domain.Student, error) {
	if s, ok := f.studentsByTelegramID[telegramID]; ok {
		return s, nil
	}
	return nil, nil
}

func (f *fakeStudentRepo) AddStudent(student domain.Student) error {
	f.added = append(f.added, student)
	f.studentsByTelegramID[student.TelegramID] = &student
	return nil
}

// TestTakeUpdateNonMessageNoPanic covers #17: any update without a usable
// message (callback_query, edited_message, message without chat/from, bare
// update_id) must be ignored instead of panicking.
func TestTakeUpdateNonMessageNoPanic(t *testing.T) {
	updates := map[string]tgbotapi.Update{
		"empty update":               {UpdateID: 1},
		"callback query only":        {UpdateID: 2, CallbackQuery: &tgbotapi.CallbackQuery{ID: "cb"}},
		"edited message":             {UpdateID: 3, EditedMessage: &tgbotapi.Message{Text: "/start"}},
		"inline query":               {UpdateID: 4, InlineQuery: &tgbotapi.InlineQuery{ID: "iq"}},
		"message without chat":       {UpdateID: 5, Message: &tgbotapi.Message{Text: "/start"}},
		"message without from":       {UpdateID: 6, Message: &tgbotapi.Message{Text: "/start", Chat: &tgbotapi.Chat{ID: 42}}},
		"message other text no from": {UpdateID: 7, Message: &tgbotapi.Message{Text: "hi", Chat: &tgbotapi.Chat{ID: 42}}},
	}

	for name, update := range updates {
		t.Run(name, func(t *testing.T) {
			repo := &fakeStudentRepo{studentsByTelegramID: map[string]*domain.Student{}}
			uc := NewTelegramUsecase(nil, repo)
			if err := uc.TakeUpdate(update); err != nil {
				t.Fatalf("TakeUpdate(%s) returned error: %v", name, err)
			}
		})
	}
}

// TestHandleStartCommandHonorsUserID covers the second half of #17: the user id
// from the update must drive student lookup/registration.
func TestHandleStartCommandHonorsUserID(t *testing.T) {
	t.Run("registers unknown telegram user", func(t *testing.T) {
		repo := &fakeStudentRepo{studentsByTelegramID: map[string]*domain.Student{}}
		uc := &telegramUsecase{studentRepo: repo}

		if err := uc.HandleStartCommand(100, 777001); err != nil {
			t.Fatalf("HandleStartCommand: %v", err)
		}
		if len(repo.added) != 1 || repo.added[0].TelegramID != "777001" {
			t.Fatalf("expected one registered student with telegram_id 777001, got %+v", repo.added)
		}
	})

	t.Run("looks up existing telegram user without duplicating", func(t *testing.T) {
		repo := &fakeStudentRepo{studentsByTelegramID: map[string]*domain.Student{
			"777001": {ID: "student-uuid", TelegramID: "777001", Name: "Existing"},
		}}
		uc := &telegramUsecase{studentRepo: repo}

		if err := uc.HandleStartCommand(100, 777001); err != nil {
			t.Fatalf("HandleStartCommand: %v", err)
		}
		if len(repo.added) != 0 {
			t.Fatalf("expected no new student registered, got %+v", repo.added)
		}
	})

	t.Run("take update wires message user id into start handler", func(t *testing.T) {
		repo := &fakeStudentRepo{studentsByTelegramID: map[string]*domain.Student{}}
		uc := &telegramUsecase{studentRepo: repo}
		update := tgbotapi.Update{
			UpdateID: 9,
			Message: &tgbotapi.Message{
				Text: "/start",
				Chat: &tgbotapi.Chat{ID: 555},
				From: &tgbotapi.User{ID: 888002},
			},
		}
		if err := uc.TakeUpdate(update); err != nil {
			t.Fatalf("TakeUpdate: %v", err)
		}
		if len(repo.added) != 1 || repo.added[0].TelegramID != "888002" {
			t.Fatalf("expected student registered from update.From.ID, got %+v", repo.added)
		}
	})
}
