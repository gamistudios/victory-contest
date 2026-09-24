package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// ---- fakes -------------------------------------------------------------

// commentCrudArticleRepo is a minimal ArticleRepository fake that records
// calls on a shared sequence tracer so tests can assert call ordering.
type commentCrudArticleRepo struct {
	seq      *[]string
	articles map[string]*domain.Article
}

func (f *commentCrudArticleRepo) record(name string) { *f.seq = append(*f.seq, name) }

func (f *commentCrudArticleRepo) Create(article domain.Article) (string, error) {
	f.record("article.Create")
	f.articles[article.ID] = &article
	return article.ID, nil
}
func (f *commentCrudArticleRepo) Update(id string, article domain.Article) error {
	f.record("article.Update")
	return nil
}
func (f *commentCrudArticleRepo) Delete(id string) error { f.record("article.Delete"); return nil }
func (f *commentCrudArticleRepo) GetByID(id string) (*domain.Article, error) {
	f.record("article.GetByID")
	if a, ok := f.articles[id]; ok {
		return a, nil
	}
	return nil, nil
}
func (f *commentCrudArticleRepo) List() ([]domain.Article, error) { return nil, nil }
func (f *commentCrudArticleRepo) ListPublished() ([]domain.Article, error) {
	return nil, nil
}
func (f *commentCrudArticleRepo) GetByStatus(status domain.ArticleStatus) ([]domain.Article, error) {
	return nil, nil
}
func (f *commentCrudArticleRepo) IncrementView(id string) error { return nil }
func (f *commentCrudArticleRepo) DecrementView(id string) error { return nil }
func (f *commentCrudArticleRepo) IncrementLike(id string) error { return nil }
func (f *commentCrudArticleRepo) DecrementLike(id string) error { return nil }
func (f *commentCrudArticleRepo) IncrementComments(id string) error {
	f.record("article.IncrementComments")
	return nil
}
func (f *commentCrudArticleRepo) DecrementComments(id string) error {
	f.record("article.DecrementComments")
	return nil
}

// commentCrudRepo is a minimal CommentRepository fake backed by a map.
type commentCrudRepo struct {
	seq      *[]string
	comments map[string]*domain.Comment
}

func (f *commentCrudRepo) record(name string) { *f.seq = append(*f.seq, name) }

func (f *commentCrudRepo) Create(comment domain.Comment) (string, error) {
	f.record("comment.Create")
	c := comment
	f.comments[c.ID] = &c
	return c.ID, nil
}
func (f *commentCrudRepo) ListByArticleID(articleID string) ([]domain.Comment, error) {
	f.record("comment.ListByArticleID")
	var out []domain.Comment
	for _, c := range f.comments {
		if c.ArticleID == articleID {
			out = append(out, *c)
		}
	}
	return out, nil
}
func (f *commentCrudRepo) GetByID(id string) (*domain.Comment, error) {
	f.record("comment.GetByID")
	if c, ok := f.comments[id]; ok {
		cp := *c
		return &cp, nil
	}
	return nil, nil
}
func (f *commentCrudRepo) Update(comment domain.Comment) error {
	f.record("comment.Update")
	c := comment
	f.comments[c.ID] = &c
	return nil
}
func (f *commentCrudRepo) Delete(id string) error {
	f.record("comment.Delete")
	delete(f.comments, id)
	return nil
}

func commentCrudSetup() (*gin.Engine, *commentCrudArticleRepo, *commentCrudRepo, *[]string) {
	seq := &[]string{}
	artRepo := &commentCrudArticleRepo{seq: seq, articles: map[string]*domain.Article{
		"a1": {ID: "a1", Title: "T", CommentCount: 1},
	}}
	cmtRepo := &commentCrudRepo{seq: seq, comments: map[string]*domain.Comment{
		"c1": {ID: "c1", ArticleID: "a1", Text: "original", CreatedAt: time.Now(), UpdatedAt: time.Now()},
	}}
	// make the article's comment count observable through GetByID responses
	artRepo.articles["a1"].CommentCount = 1

	gin.SetMode(gin.TestMode)
	r := gin.New()
	NewArticleHandler(usecase.NewArticleUsecase(artRepo, cmtRepo)).Register(r.Group("/api"))
	return r, artRepo, cmtRepo, seq
}

// ---- tests --------------------------------------------------------------

func TestUpdateCommentHandler_OK(t *testing.T) {
	r, _, cmtRepo, seq := commentCrudSetup()

	req := httptest.NewRequest(http.MethodPut, "/api/articles/a1/comments/c1",
		bytes.NewBufferString(`{"text":"edited"}`))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %s)", w.Code, w.Body.String())
	}
	if cmtRepo.comments["c1"] == nil || cmtRepo.comments["c1"].Text != "edited" {
		t.Fatalf("comment not persisted: %+v", cmtRepo.comments["c1"])
	}
	var resp domain.Comment
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("bad JSON response: %v", err)
	}
	if resp.Text != "edited" || resp.ID != "c1" || resp.ArticleID != "a1" {
		t.Fatalf("unexpected response payload: %+v", resp)
	}
	// sequence: lookup then update, nothing else
	assertSeq(t, *seq, "comment.GetByID", "comment.Update")
}

func TestUpdateCommentHandler_MissingComment404(t *testing.T) {
	r, _, cmtRepo, seq := commentCrudSetup()

	req := httptest.NewRequest(http.MethodPut, "/api/articles/a1/comments/nope",
		bytes.NewBufferString(`{"text":"edited"}`))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}
	if cmtRepo.comments["c1"].Text != "original" {
		t.Fatal("unrelated comment was modified")
	}
	assertSeq(t, *seq, "comment.GetByID")
}

func TestUpdateCommentHandler_BadArticleID404(t *testing.T) {
	r, _, _, seq := commentCrudSetup()

	// comment c1 exists but not under article bad-article -> 404
	req := httptest.NewRequest(http.MethodPut, "/api/articles/bad-article/comments/c1",
		bytes.NewBufferString(`{"text":"edited"}`))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}
	assertSeq(t, *seq, "comment.GetByID")
}

func TestDeleteCommentHandler_DecrementsAndSequence(t *testing.T) {
	r, artRepo, cmtRepo, seq := commentCrudSetup()
	_ = artRepo

	req := httptest.NewRequest(http.MethodDelete, "/api/articles/a1/comments/c1", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204 (body %s)", w.Code, w.Body.String())
	}
	if _, ok := cmtRepo.comments["c1"]; ok {
		t.Fatal("comment still present after delete")
	}
	// mirror of CreateComment's increment: fetch, delete, then decrement count
	assertSeq(t, *seq, "comment.GetByID", "comment.Delete", "article.DecrementComments")
}

func TestDeleteCommentHandler_MissingComment404(t *testing.T) {
	r, _, cmtRepo, seq := commentCrudSetup()

	req := httptest.NewRequest(http.MethodDelete, "/api/articles/a1/comments/nope", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}
	if _, ok := cmtRepo.comments["c1"]; !ok {
		t.Fatal("unrelated comment was deleted")
	}
	// no delete and no decrement may happen for a missing comment
	assertSeq(t, *seq, "comment.GetByID")
}

func TestDeleteCommentHandler_BadArticleID404(t *testing.T) {
	r, _, _, seq := commentCrudSetup()

	req := httptest.NewRequest(http.MethodDelete, "/api/articles/does-not-exist/comments/c1", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}
	assertSeq(t, *seq, "comment.GetByID")
}

func assertSeq(t *testing.T, got []string, want ...string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("call sequence = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("call sequence = %v, want %v", got, want)
		}
	}
}
