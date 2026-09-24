package http

import (
	"net/http"
	"victor-contest-go/internal/domain"
	"victor-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

type BankHandler struct {
	usecase usecase.BankUsecase
}

func NewBankHandler(u usecase.BankUsecase) *BankHandler {
	return &BankHandler{usecase: u}
}

func (h *BankHandler) RegisterRoutes(rg *gin.RouterGroup, adminAuth ...gin.HandlerFunc) {
	// The payment page only lists active banks; editing bank data and seeing
	// deactivated rows is admin-only.
	auth := rg.Group("", adminAuth...)
	auth.GET("/all", h.GetAllBanks)
	auth.GET("/:id", h.GetBankByID)
	auth.POST("/", h.AddBank)
	auth.PUT("/:id", h.UpdateBank)
	auth.DELETE("/:id", h.DeleteBank)
	rg.GET("/", h.GetActiveBanks)
}

// bankInput mirrors domain.Bank with is_active as a pointer so an omitted
// field on POST defaults to true instead of the Go zero value.
type bankInput struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	AccountNumber string `json:"account_number"`
	AccountHolder string `json:"account_holder"`
	Description   string `json:"description"`
	DisplayOrder  int    `json:"display_order"`
	IsActive      *bool  `json:"is_active"`
	CreatedAt     string `json:"created_at"`
}

func (i bankInput) toBank(defaultActive bool) domain.Bank {
	isActive := defaultActive
	if i.IsActive != nil {
		isActive = *i.IsActive
	}
	return domain.Bank{
		ID:            i.ID,
		Name:          i.Name,
		AccountNumber: i.AccountNumber,
		AccountHolder: i.AccountHolder,
		Description:   i.Description,
		DisplayOrder:  i.DisplayOrder,
		IsActive:      isActive,
		CreatedAt:     i.CreatedAt,
	}
}

func (h *BankHandler) GetActiveBanks(c *gin.Context) {
	banks, err := h.usecase.GetAllBanks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	active := make([]domain.Bank, 0, len(banks))
	for _, b := range banks {
		if b.IsActive {
			active = append(active, b)
		}
	}
	c.JSON(http.StatusOK, gin.H{"banks": active})
}

func (h *BankHandler) GetAllBanks(c *gin.Context) {
	banks, err := h.usecase.GetAllBanks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"banks": banks})
}

func (h *BankHandler) GetBankByID(c *gin.Context) {
	id := c.Param("id")
	bank, err := h.usecase.GetBankByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if bank == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "bank not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"bank": bank})
}

func (h *BankHandler) AddBank(c *gin.Context) {
	var input bankInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// A payment method without an account number would render as an unusable
	// dropdown entry on the student page (it shows exactly this field).
	if input.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	if input.AccountNumber == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "account_number is required"})
		return
	}
	id, err := h.usecase.AddBank(input.toBank(true))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id})
}

func (h *BankHandler) UpdateBank(c *gin.Context) {
	id := c.Param("id")
	var input bankInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if input.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	if input.AccountNumber == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "account_number is required"})
		return
	}
	isActive := true
	if input.IsActive != nil {
		isActive = *input.IsActive
	} else if existing, err := h.usecase.GetBankByID(id); err == nil && existing != nil {
		// PUT without is_active keeps the stored flag instead of flipping it.
		isActive = existing.IsActive
	}
	bank := input.toBank(false)
	bank.IsActive = isActive
	err := h.usecase.UpdateBank(id, bank)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success"})
}

func (h *BankHandler) DeleteBank(c *gin.Context) {
	id := c.Param("id")
	err := h.usecase.DeleteBank(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success"})
}
