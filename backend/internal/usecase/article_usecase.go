package usecase

import (
	"errors"
	"fmt"
	"log"
	"time"
	"victory-contest-go/internal/domain"
)

// ErrArticleNotFound is returned when an article id does not exist.
var ErrArticleNotFound = errors.New("article not found")

// ErrCommentNotFound is returned when a comment id does not exist or does not
// belong to the article it is being addressed under.
var ErrCommentNotFound = errors.New("comment not found")

type ArticleUsecase struct {
	repo        ArticleRepository
	commentRepo CommentRepository
}

func NewArticleUsecase(repo ArticleRepository, commentRepo CommentRepository) *ArticleUsecase {
	return &ArticleUsecase{repo: repo, commentRepo: commentRepo}
}

func (u *ArticleUsecase) Create(input domain.Article) (string, error) {
	if input.Status == "" {
		input.Status = domain.ArticleStatusDraft
	}
	now := time.Now()
	if input.CreatedAt.IsZero() {
		input.CreatedAt = now
	}
	input.UpdatedAt = now
	if input.Status == domain.ArticleStatusPublished {
		input.PublishedAt = &now
	} else {
		input.PublishedAt = nil
	}
	input.ID = GenerateUniqueId()
	input.CreatedAt = now
	return u.repo.Create(input)
}

func (u *ArticleUsecase) Update(id string, update domain.Article) error {
	update.UpdatedAt = time.Now()
	article, err := u.GetByID(id)
	if err != nil {
		return err
	}
	if article != nil {
		update.LikeCount = article.LikeCount
		update.ViewCount = article.ViewCount
		update.ReadTime = article.ReadTime
	}

	return u.repo.Update(id, update)
}

func (u *ArticleUsecase) Delete(id string) error { return u.repo.Delete(id) }

func (u *ArticleUsecase) GetByID(id string) (*domain.Article, error) { return u.repo.GetByID(id) }

func (u *ArticleUsecase) List() ([]domain.Article, error) { return u.repo.List() }

func (u *ArticleUsecase) ListPublished() ([]domain.Article, error) { return u.repo.ListPublished() }

func (u *ArticleUsecase) GetByStatus(status domain.ArticleStatus) ([]domain.Article, error) {
	return u.repo.GetByStatus(status)
}

func (uc *ArticleUsecase) ToggleStatus(id string, status domain.ArticleStatus) error {
	article, err := uc.repo.GetByID(id)
	if err != nil {
		return err
	}
	if article == nil {
		return fmt.Errorf("article not found")
	}

	article.Status = status
	article.UpdatedAt = time.Now()
	if status == domain.ArticleStatusPublished && article.PublishedAt == nil {
		now := time.Now()
		article.PublishedAt = &now
	}

	return uc.repo.Update(id, *article)
}

func (uc *ArticleUsecase) IncrementView(id string) error {
	return uc.repo.IncrementView(id)
}

func (uc *ArticleUsecase) IncrementLike(id string) error {
	return uc.repo.IncrementLike(id)
}

func (uc *ArticleUsecase) DecrementView(id string) error {
	return uc.repo.DecrementView(id)
}

func (uc *ArticleUsecase) DecrementLike(id string) error {
	return uc.repo.DecrementLike(id)
}

// Comment methods
func (uc *ArticleUsecase) CreateComment(comment domain.Comment) (string, error) {
	article, err := uc.repo.GetByID(comment.ArticleID)
	if err != nil {
		return "", err
	}
	if article == nil {
		return "", ErrArticleNotFound
	}

	id, err := uc.commentRepo.Create(comment)
	if err != nil {
		return "", err
	}
	// increment the counter on the article, not on the comment
	if err := uc.repo.IncrementComments(comment.ArticleID); err != nil {
		log.Printf("failed to increment comment count: %v", err)
		return id, err
	}
	return id, nil
}

func (uc *ArticleUsecase) ListCommentsByArticleID(articleID string) ([]domain.Comment, error) {
	return uc.commentRepo.ListByArticleID(articleID)
}

// UpdateComment replaces the text of an existing comment.
// NOTE: an author-only check is not possible yet — no auth middleware exists
// in this codebase (tracked as README issue #6).
func (uc *ArticleUsecase) UpdateComment(articleID, commentID, text string) (*domain.Comment, error) {
	comment, err := uc.commentRepo.GetByID(commentID)
	if err != nil {
		return nil, err
	}
	// also covers a comment that exists but belongs to a different article
	if comment == nil || comment.ArticleID != articleID {
		return nil, ErrCommentNotFound
	}

	comment.Text = text
	comment.UpdatedAt = time.Now().UTC()
	if err := uc.commentRepo.Update(*comment); err != nil {
		return nil, err
	}
	return comment, nil
}

// DeleteComment removes a comment and decrements the article's comment count,
// mirroring the increment in CreateComment.
// NOTE: an author-only check is not possible yet — no auth middleware exists
// in this codebase (tracked as README issue #6).
func (uc *ArticleUsecase) DeleteComment(articleID, commentID string) error {
	comment, err := uc.commentRepo.GetByID(commentID)
	if err != nil {
		return err
	}
	if comment == nil || comment.ArticleID != articleID {
		return ErrCommentNotFound
	}

	if err := uc.commentRepo.Delete(commentID); err != nil {
		return err
	}
	// decrement the counter on the article, not on the comment
	if err := uc.repo.DecrementComments(articleID); err != nil {
		log.Printf("failed to decrement comment count: %v", err)
		return err
	}
	return nil
}
