package usecase

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"victor-contest-go/internal/domain"
)

// AiProviderRepository is the persistence port for admin-managed AI
// providers. It lives here (not in the shared interfaces.go) so this slice
// stays self-contained; the DynamoDB implementation is
// repository.AiProviderDynamoRepository.
type AiProviderRepository interface {
	AddProvider(p domain.AIProvider) (string, error)
	UpdateProvider(p domain.AIProvider) error
	DeleteProvider(id string) error
	GetProviderByID(id string) (*domain.AIProvider, error)
	GetAllProviders() ([]domain.AIProvider, error)
}

// providerInputError marks client-fixable faults (validation, missing row)
// so the admin handler can answer 400/404 instead of a blanket 500.
type providerInputError struct{ err error }

func (e providerInputError) Error() string { return e.err.Error() }
func (e providerInputError) Unwrap() error { return e.err }

// IsProviderInputError reports whether err originated from provider input
// validation rather than the repository or an upstream service.
func IsProviderInputError(err error) bool {
	var t providerInputError
	return errors.As(err, &t)
}

// ErrProviderNotFound is returned (wrapped in a providerInputError) when an
// id does not resolve to a stored row.
var ErrProviderNotFound = errors.New("provider not found")

// ProviderTestResult is the masked outcome of POST /api/ai-admin/providers/:id/test.
// Message never contains the API key and never echoes raw upstream bodies.
type ProviderTestResult struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
}

type AiProviderUsecase interface {
	ListProviders() ([]domain.AIProvider, error)
	GetProviderByID(id string) (*domain.AIProvider, error)
	CreateProvider(p domain.AIProvider) (string, error)
	UpdateProvider(id string, p domain.AIProvider) error
	DeleteProvider(id string) error
	TestProvider(id string) (*ProviderTestResult, error)
}

type aiProviderUsecase struct {
	repo AiProviderRepository
}

func NewAiProviderUsecase(repo AiProviderRepository) AiProviderUsecase {
	return &aiProviderUsecase{repo: repo}
}

func (u *aiProviderUsecase) ListProviders() ([]domain.AIProvider, error) {
	return u.repo.GetAllProviders()
}

func (u *aiProviderUsecase) GetProviderByID(id string) (*domain.AIProvider, error) {
	return u.repo.GetProviderByID(id)
}

// CreateProvider validates the row (protocol enum, https-or-localhost
// base_url with no embedded credentials, at least one model) before storing.
// An explicit Enabled pointer default is applied by the handler.
func (u *aiProviderUsecase) CreateProvider(p domain.AIProvider) (string, error) {
	if err := p.Validate(); err != nil {
		return "", providerInputError{err}
	}
	if strings.TrimSpace(p.APIKey) == "" {
		return "", providerInputError{errors.New("api_key is required")}
	}
	return u.repo.AddProvider(p)
}

// UpdateProvider replaces the row identified by id. An empty APIKey in the
// payload means "keep the stored key" so admins can edit a provider without
// ever re-sending the secret. CreatedAt is preserved from the stored row.
func (u *aiProviderUsecase) UpdateProvider(id string, p domain.AIProvider) error {
	existing, err := u.repo.GetProviderByID(id)
	if err != nil {
		return err
	}
	if existing == nil {
		return providerInputError{fmt.Errorf("%w: %q", ErrProviderNotFound, id)}
	}
	p.ID = id
	if p.APIKey == "" {
		p.APIKey = existing.APIKey
	}
	p.CreatedAt = existing.CreatedAt
	if err := p.Validate(); err != nil {
		return providerInputError{err}
	}
	return u.repo.UpdateProvider(p)
}

func (u *aiProviderUsecase) DeleteProvider(id string) error {
	return u.repo.DeleteProvider(id)
}

// TestProvider sends one tiny prompt through the provider's own protocol
// adapter and reports a masked ok/error. The stored key is never returned.
func (u *aiProviderUsecase) TestProvider(id string) (*ProviderTestResult, error) {
	p, err := u.repo.GetProviderByID(id)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, providerInputError{fmt.Errorf("%w: %q", ErrProviderNotFound, id)}
	}
	if len(p.Models) == 0 {
		return &ProviderTestResult{OK: false, Message: "provider has no models configured"}, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), aiProbeTimeout)
	defer cancel()
	text, err := completeProvider(ctx, *p, p.Models[0], completionRequest{
		prompt:    "Connection test. Reply with exactly: PONG",
		maxTokens: 64,
	})
	if err != nil {
		return &ProviderTestResult{OK: false, Message: maskKey(err.Error(), p.APIKey)}, nil
	}
	sample := strings.TrimSpace(text)
	if len(sample) > 80 {
		sample = sample[:80] + "…"
	}
	return &ProviderTestResult{OK: true, Message: "connected; sample reply: " + sample}, nil
}

// pickEnabledProvider is the single selection rule used by every AI call
// path: the oldest-created enabled provider with at least one model wins.
// Sorting is stable on (created_at, id) so selection is deterministic even
// when rows share a timestamp.
func pickEnabledProvider(providers []domain.AIProvider) *domain.AIProvider {
	usable := make([]domain.AIProvider, 0, len(providers))
	for _, p := range providers {
		if p.Enabled && len(p.Models) > 0 {
			usable = append(usable, p)
		}
	}
	if len(usable) == 0 {
		return nil
	}
	sort.SliceStable(usable, func(i, j int) bool {
		if usable[i].CreatedAt != usable[j].CreatedAt {
			return usable[i].CreatedAt < usable[j].CreatedAt
		}
		return usable[i].ID < usable[j].ID
	})
	return &usable[0]
}
