package usecase

import (
	"errors"
	"testing"

	"victor-contest-go/internal/domain"

	"golang.org/x/crypto/bcrypt"
)

// fakeAdminRepo is an in-memory AdminRepository used to observe exactly what
// the usecase writes back (slice A: id-keyed read-modify-write).
type fakeAdminRepo struct {
	admins     map[string]*domain.Admin
	updates    []domain.Admin
	deletes    []string
	getByIDErr error
}

func (f *fakeAdminRepo) AddAdmin(admin domain.Admin) (string, error) {
	f.admins[admin.ID] = &admin
	return admin.ID, nil
}

func (f *fakeAdminRepo) UpdateAdmin(id string, update domain.Admin) error {
	update.ID = id
	recorded := update
	f.updates = append(f.updates, recorded)
	f.admins[id] = &recorded
	return nil
}

func (f *fakeAdminRepo) DeleteAdmin(id string) error {
	f.deletes = append(f.deletes, id)
	delete(f.admins, id)
	return nil
}

func (f *fakeAdminRepo) GetAdminByID(id string) (*domain.Admin, error) {
	if f.getByIDErr != nil {
		return nil, f.getByIDErr
	}
	admin, ok := f.admins[id]
	if !ok {
		return nil, nil
	}
	copied := *admin
	return &copied, nil
}

func (f *fakeAdminRepo) GetAllAdmins() ([]domain.Admin, error) {
	out := make([]domain.Admin, 0, len(f.admins))
	for _, a := range f.admins {
		out = append(out, *a)
	}
	return out, nil
}

func (f *fakeAdminRepo) GetAdminByEmail(email string) (*domain.Admin, error) {
	for _, a := range f.admins {
		if a.Email == email {
			copied := *a
			return &copied, nil
		}
	}
	return nil, nil
}

func newAdminUsecaseWithRepo(repo AdminRepository) *adminUsecase {
	return &adminUsecase{repo: repo}
}

func strPtr(s string) *string { return &s }
func boolPtr(b bool) *bool    { return &b }

// TestUpdateAdminMergesByIDNeverBlanksStoredFields covers the PUT fix: the
// stored row is loaded by id, only the provided fields are applied, email is
// never touched, and no partial-body write can drop data.
func TestUpdateAdminMergesByIDNeverBlanksStoredFields(t *testing.T) {
	hash, err := bcrypt.GenerateFromPassword([]byte("old-secret"), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("hash seed password: %v", err)
	}
	repo := &fakeAdminRepo{admins: map[string]*domain.Admin{
		"admin-1": {ID: "admin-1", Email: "root@example.com", Name: "Root", IsApproved: false, Password: string(hash)},
	}}
	u := newAdminUsecaseWithRepo(repo)

	if err := u.UpdateAdmin("admin-1", AdminUpdate{IsApproved: boolPtr(true)}); err != nil {
		t.Fatalf("UpdateAdmin: %v", err)
	}
	got := repo.admins["admin-1"]
	if got == nil {
		t.Fatal("row vanished after update")
	}
	if !got.IsApproved {
		t.Fatal("is_approved was not applied")
	}
	if got.Email != "root@example.com" || got.Name != "Root" {
		t.Fatalf("partial update must not blank stored fields, got %+v", got)
	}
	if got.Password != string(hash) {
		t.Fatal("password must survive an approval-only update")
	}

	// Rename keeps everything else intact.
	if err := u.UpdateAdmin("admin-1", AdminUpdate{Name: strPtr("Root Two")}); err != nil {
		t.Fatalf("UpdateAdmin rename: %v", err)
	}
	got = repo.admins["admin-1"]
	if got.Name != "Root Two" || !got.IsApproved || got.Email != "root@example.com" {
		t.Fatalf("unexpected row after rename: %+v", got)
	}

	// Password change is stored bcrypt-hashed, not plaintext.
	if err := u.UpdateAdmin("admin-1", AdminUpdate{Password: strPtr("new-secret")}); err != nil {
		t.Fatalf("UpdateAdmin password: %v", err)
	}
	got = repo.admins["admin-1"]
	if got.Password == "new-secret" {
		t.Fatal("password stored in plaintext")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(got.Password), []byte("new-secret")); err != nil {
		t.Fatalf("re-hashed password no longer matches: %v", err)
	}
}

// TestUpdateAdminUnknownIDReturnsNotFoundAndNoWrite pins the orphan-row fix:
// PUT against a missing id must fail with ErrAdminNotFound and must never
// PutItem a brand-new row keyed by that id.
func TestUpdateAdminUnknownIDReturnsNotFoundAndNoWrite(t *testing.T) {
	repo := &fakeAdminRepo{admins: map[string]*domain.Admin{}}
	u := newAdminUsecaseWithRepo(repo)

	err := u.UpdateAdmin("ghost", AdminUpdate{IsApproved: boolPtr(true)})
	if !errors.Is(err, ErrAdminNotFound) {
		t.Fatalf("err = %v, want ErrAdminNotFound", err)
	}
	if len(repo.updates) != 0 || len(repo.admins) != 0 {
		t.Fatalf("unknown-id PUT must not write, got updates=%v admins=%v", repo.updates, repo.admins)
	}
}

// TestDeleteAdminUnknownIDReturnsNotFound checks DELETE 404-mapping source.
func TestDeleteAdminUnknownIDReturnsNotFound(t *testing.T) {
	repo := &fakeAdminRepo{admins: map[string]*domain.Admin{}}
	u := newAdminUsecaseWithRepo(repo)

	if err := u.DeleteAdmin("ghost"); !errors.Is(err, ErrAdminNotFound) {
		t.Fatalf("err = %v, want ErrAdminNotFound", err)
	}
	if len(repo.deletes) != 0 {
		t.Fatalf("unknown-id DELETE must not reach the repo, got %v", repo.deletes)
	}
}

// TestDeleteAdminRemovesKeyedRow covers the happy path.
func TestDeleteAdminRemovesKeyedRow(t *testing.T) {
	repo := &fakeAdminRepo{admins: map[string]*domain.Admin{
		"admin-1": {ID: "admin-1", Email: "root@example.com"},
	}}
	u := newAdminUsecaseWithRepo(repo)

	if err := u.DeleteAdmin("admin-1"); err != nil {
		t.Fatalf("DeleteAdmin: %v", err)
	}
	if len(repo.deletes) != 1 || repo.deletes[0] != "admin-1" {
		t.Fatalf("repo deletes = %v, want [admin-1]", repo.deletes)
	}
	if _, ok := repo.admins["admin-1"]; ok {
		t.Fatal("row still present after delete")
	}
}

// TestSignInUnapprovedReturnsErrNotApproved pins the usecase half of the
// approval gate: right password + IsApproved=false is ErrNotApproved (never
// ErrInvalidCredentials, never a returned admin).
func TestSignInUnapprovedReturnsErrNotApproved(t *testing.T) {
	hash, err := bcrypt.GenerateFromPassword([]byte("hunter2"), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("hash seed password: %v", err)
	}
	repo := &fakeAdminRepo{admins: map[string]*domain.Admin{
		"admin-1": {ID: "admin-1", Email: "new@example.com", Password: string(hash), IsApproved: false},
	}}
	u := newAdminUsecaseWithRepo(repo)

	admin, err := u.SignIn("new@example.com", "hunter2")
	if !errors.Is(err, ErrNotApproved) {
		t.Fatalf("err = %v, want ErrNotApproved", err)
	}
	if admin != nil {
		t.Fatalf("unapproved sign-in must not return an admin, got %+v", admin)
	}
	if len(repo.updates) != 0 {
		t.Fatalf("unapproved sign-in must not write, got %v", repo.updates)
	}
}

// TestSignInApprovedStillWorks guards against the gate rejecting valid
// approved logins (wrong password stays 401-material, right password returns
// the admin with the password scrubbed).
func TestSignInApprovedStillWorks(t *testing.T) {
	hash, err := bcrypt.GenerateFromPassword([]byte("hunter2"), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("hash seed password: %v", err)
	}
	repo := &fakeAdminRepo{admins: map[string]*domain.Admin{
		"admin-1": {ID: "admin-1", Email: "root@example.com", Password: string(hash), IsApproved: true},
	}}
	u := newAdminUsecaseWithRepo(repo)

	admin, err := u.SignIn("root@example.com", "hunter2")
	if err != nil {
		t.Fatalf("approved sign-in failed: %v", err)
	}
	if admin == nil || admin.Email != "root@example.com" || admin.Password != "" {
		t.Fatalf("unexpected admin payload: %+v", admin)
	}

	if _, err := u.SignIn("root@example.com", "wrong"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("wrong password err = %v, want ErrInvalidCredentials", err)
	}
}
