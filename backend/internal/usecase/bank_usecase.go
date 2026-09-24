package usecase

import "victory-contest-go/internal/domain"

type BankUsecase interface {
	AddBank(bank domain.Bank) (string, error)
	UpdateBank(id string, update domain.Bank) error
	DeleteBank(id string) error
	GetBankByID(id string) (*domain.Bank, error)
	GetAllBanks() ([]domain.Bank, error)
}

type bankUsecase struct {
	repo BankRepository
}

func NewBankUsecase(repo BankRepository) BankUsecase {
	return &bankUsecase{repo: repo}
}

func (u *bankUsecase) AddBank(bank domain.Bank) (string, error) {
	return u.repo.AddBank(bank)
}

func (u *bankUsecase) UpdateBank(id string, update domain.Bank) error {
	return u.repo.UpdateBank(id, update)
}

func (u *bankUsecase) DeleteBank(id string) error {
	return u.repo.DeleteBank(id)
}

func (u *bankUsecase) GetBankByID(id string) (*domain.Bank, error) {
	return u.repo.GetBankByID(id)
}

func (u *bankUsecase) GetAllBanks() ([]domain.Bank, error) {
	return u.repo.GetAllBanks()
}
