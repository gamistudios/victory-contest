package usecase

import (
	"errors"
	"log"
	"sort"
	"strings"
	"sync"
	"time"

	"victory-contest-go/internal/domain"
)

type PricePlanRepository interface {
	Put(p domain.PricePlan) error
	Get(id string) (*domain.PricePlan, error)
	Delete(id string) error
	List() ([]domain.PricePlan, error)
}

type CouponRepository interface {
	Put(c domain.Coupon) error
	Get(id string) (*domain.Coupon, error)
	GetByCode(code string) (*domain.Coupon, error)
	Delete(id string) error
	List() ([]domain.Coupon, error)
	Redeem(id string, max int) error // atomic counter; ErrCouponExhausted when full
	Release(id string) error         // atomic decrement (never below 0); undoes one Redeem
}

type EntitlementRepository interface {
	ListByStudent(studentID string) ([]domain.Entitlement, error)
	ReplaceForStudent(studentID string, es []domain.Entitlement) error
}

var (
	ErrPlanNotFound   = errors.New("plan not found")
	ErrCouponNotFound = errors.New("coupon not found")
	ErrPlanInvalid    = errors.New("invalid plan")
)

// PricingUsecase owns plans, coupons, quotes and entitlements (plan §5.12).
type PricingUsecase struct {
	plans      PricePlanRepository
	coupons    CouponRepository
	ents       EntitlementRepository
	payments   PaymentRepository
	programIDs func() []string // active program ids, for AllPrograms expansion
	graceDays  int
	redeemMu   sync.Mutex // serialises limit check + reservation per process
	now        func() time.Time
}

func NewPricingUsecase(plans PricePlanRepository, coupons CouponRepository, ents EntitlementRepository,
	payments PaymentRepository, programIDs func() []string) *PricingUsecase {
	return &PricingUsecase{plans: plans, coupons: coupons, ents: ents, payments: payments,
		programIDs: programIDs, graceDays: domain.DefaultGraceDays, now: time.Now}
}

// ---- plans (admin CRUD + public listing) ----

func (u *PricingUsecase) ValidatePlan(p domain.PricePlan) error {
	if strings.TrimSpace(p.Name) == "" || (!p.AllPrograms && len(p.ProgramIDs) == 0) || len(p.Prices) == 0 {
		return ErrPlanInvalid
	}
	seen := map[string]bool{}
	for _, m := range p.Prices {
		if m.Amount < 0 || seen[m.Currency] || (m.Currency != domain.CurrencyETB && m.Currency != domain.CurrencyXTR) {
			return ErrPlanInvalid
		}
		seen[m.Currency] = true
	}
	switch p.Validity.Type {
	case domain.ValidityDays:
		if p.Validity.Days <= 0 {
			return ErrPlanInvalid
		}
	case domain.ValidityFixedEnd:
		if _, ok := parseTime(p.Validity.EndsAt); !ok {
			return ErrPlanInvalid
		}
	case domain.ValidityLifetime:
	default:
		return ErrPlanInvalid
	}
	return nil
}

func (u *PricingUsecase) SavePlan(p domain.PricePlan, admin string) (*domain.PricePlan, error) {
	if err := u.ValidatePlan(p); err != nil {
		return nil, err
	}
	if p.ID == "" {
		p.ID = GenerateUniqueId()
	}
	p.UpdatedBy, p.UpdatedAt = admin, u.now().UTC().Format(time.RFC3339)
	return &p, u.plans.Put(p)
}

func (u *PricingUsecase) DeletePlan(id string) error { return u.plans.Delete(id) }

func (u *PricingUsecase) AdminPlans() ([]domain.PricePlan, error) {
	all, err := u.plans.List()
	sort.SliceStable(all, func(i, j int) bool { return all[i].SortOrder < all[j].SortOrder })
	return all, err
}

// PublicPlans returns plans visible now, optionally for one program, with the
// effective (sale-aware) price per currency.
func (u *PricingUsecase) PublicPlans(programID string) ([]domain.PricePlan, error) {
	all, err := u.plans.List()
	if err != nil {
		return nil, err
	}
	if programID != "" {
		return PlansForProgram(all, programID, u.now()), nil
	}
	var out []domain.PricePlan
	for _, p := range all {
		if PlanVisible(p, u.now()) {
			out = append(out, p)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].SortOrder < out[j].SortOrder })
	return out, nil
}

// ---- coupons ----

func (u *PricingUsecase) SaveCoupon(c domain.Coupon) (*domain.Coupon, error) {
	c.Code = strings.ToUpper(strings.TrimSpace(c.Code))
	if c.Code == "" || c.Value <= 0 || (c.Kind != domain.CouponPercent && c.Kind != domain.CouponFixed) ||
		(c.Kind == domain.CouponPercent && c.Value > 100) {
		return nil, ErrCouponInvalid
	}
	if c.MaxRedemptions < 0 || c.PerStudentLimit < 0 {
		return nil, ErrCouponInvalid
	}
	if c.MaxRedemptions > 0 && c.PerStudentLimit > c.MaxRedemptions {
		return nil, ErrCouponInvalid
	}
	if ex, _ := u.coupons.GetByCode(c.Code); ex != nil && ex.ID != c.ID {
		return nil, errors.New("coupon code already exists")
	}
	// The redemption counter is server-owned: an admin edit must never reset it.
	if c.ID != "" {
		if cur, _ := u.coupons.GetByCode(c.Code); cur != nil && cur.ID == c.ID {
			c.Redeemed = cur.Redeemed
		}
	}
	if c.ID == "" {
		c.ID = GenerateUniqueId()
	}
	return &c, u.coupons.Put(c)
}
func (u *PricingUsecase) ListCoupons() ([]domain.Coupon, error) { return u.coupons.List() }
func (u *PricingUsecase) DeleteCoupon(id string) error          { return u.coupons.Delete(id) }

// ---- quote ----

func (u *PricingUsecase) redeemedBy(studentID, code string) int {
	if code == "" || u.payments == nil {
		return 0
	}
	ps, err := u.payments.ListByUser(studentID)
	if err != nil {
		return 0
	}
	n := 0
	for _, p := range ps {
		if strings.EqualFold(p.CouponCode, code) && p.Status != domain.StatusRejected && !p.Revoked {
			n++
		}
	}
	return n
}

// Quote computes the server-authoritative price. couponCode may be empty.
func (u *PricingUsecase) Quote(studentID, planID, currency, couponCode string) (*Quote, *domain.Coupon, error) {
	plan, err := u.plans.Get(planID)
	if err != nil {
		return nil, nil, err
	}
	if plan == nil || !plan.IsActive {
		return nil, nil, ErrPlanNotFound
	}
	var coupon *domain.Coupon
	if strings.TrimSpace(couponCode) != "" {
		if coupon, err = u.coupons.GetByCode(couponCode); err != nil {
			return nil, nil, err
		}
		if coupon == nil {
			return nil, nil, ErrCouponNotFound
		}
	}
	q, err := BuildQuote(*plan, currency, coupon, u.now(), u.redeemedBy(studentID, couponCode))
	if err != nil {
		return nil, nil, err
	}
	return &q, coupon, nil
}

// Snapshot stamps a payment with the plan terms and reserves the coupon.
// A free quote (100% coupon) is returned as free=true so the caller can
// auto-approve without proof.
func (u *PricingUsecase) Snapshot(p *domain.PaymentRequest, planID, currency, couponCode string) (free bool, err error) {
	// Per-student limit: the check (inside Quote) and the reservation below
	// must not interleave with another request from the same student.
	u.redeemMu.Lock()
	defer u.redeemMu.Unlock()
	q, coupon, err := u.Quote(p.UserID, planID, currency, couponCode)
	if err != nil {
		return false, err
	}
	if coupon != nil {
		if err := u.coupons.Redeem(coupon.ID, coupon.MaxRedemptions); err != nil {
			return false, err
		}
		p.CouponCode = coupon.Code
	}
	v := q.Validity
	// NOTE: p.Amount keeps the student-reported transfer figure (legacy
	// semantics). The server price lives in FinalAmount; overwriting Amount
	// here used to make PaymentAmountMismatch compare the quote with itself,
	// dead-coding the approval guard.
	p.PlanID, p.Currency, p.FinalAmount, p.ProgramIDs, p.Validity = planID, q.Currency, q.Final, q.ProgramIDs, &v
	// Plan-based expiry replaces the hardcoded month; the authoritative end
	// is recomputed by RebuildEntitlements on approval (which reads Validity
	// first), so this only keeps legacy ExpirationDate readers truthful.
	p.ExpirationDate = planExpiry(v, p.CreatedAt)
	return q.Free, nil
}

// planExpiry derives the legacy ExpirationDate stamp from a plan validity.
// Lifetime plans return nil; grantsAccess and the AI gate treat a lifetime
// Validity row as active without an expiry date.
func planExpiry(v domain.Validity, from time.Time) *time.Time {
	switch v.Type {
	case domain.ValidityDays:
		if v.Days > 0 {
			e := from.AddDate(0, 0, v.Days)
			return &e
		}
	case domain.ValidityFixedEnd:
		if t, ok := parseTime(v.EndsAt); ok {
			return &t
		}
	}
	return nil
}

// ReleaseCoupon gives back the coupon use reserved by a payment that was
// rejected or deleted, so the global max_redemptions slot is not lost.
// Best effort: a failure is logged, never returned to the admin action.
func (u *PricingUsecase) ReleaseCoupon(p *domain.PaymentRequest) {
	if u == nil || p == nil || strings.TrimSpace(p.CouponCode) == "" {
		return
	}
	c, err := u.coupons.GetByCode(p.CouponCode)
	if err != nil || c == nil {
		return
	}
	if err := u.coupons.Release(c.ID); err != nil {
		log.Printf("coupon release %s for payment %s: %v", c.Code, p.ID, err)
	}
}

// ---- entitlements ----

func (u *PricingUsecase) grantsFor(studentID string) ([]Grant, error) {
	ps, err := u.payments.ListByUser(studentID)
	if err != nil {
		return nil, err
	}
	var gs []Grant
	for _, p := range ps {
		if p.Status != domain.StatusApproved || p.Revoked {
			continue
		}
		at := p.UpdatedAt
		if at.IsZero() {
			at = p.CreatedAt
		}
		src := domain.EntitlementSourcePayment
		if p.BankName == "Admin grant" {
			src = domain.EntitlementSourceAdminGrant
		} else if p.FinalAmount == 0 && p.CouponCode != "" {
			src = domain.EntitlementSourceCouponFree
		}
		g := Grant{ProgramIDs: p.ProgramIDs, PlanID: p.PlanID, Source: src, ApprovedAt: at}
		switch {
		case p.Validity != nil:
			g.Validity = *p.Validity
		case p.ExpirationDate != nil:
			// Legacy row: premium for everything until the stored expiry.
			g.ProgramIDs = nil
			g.Validity = domain.Validity{Type: domain.ValidityFixedEnd, EndsAt: p.ExpirationDate.UTC().Format(time.RFC3339)}
		default:
			continue
		}
		gs = append(gs, g)
	}
	return gs, nil
}

// Rebuild recomputes and stores the student's entitlements from the ledger.
func (u *PricingUsecase) Rebuild(studentID string) ([]domain.Entitlement, error) {
	gs, err := u.grantsFor(studentID)
	if err != nil {
		return nil, err
	}
	var all []string
	if u.programIDs != nil {
		all = u.programIDs()
	}
	es := RebuildEntitlements(studentID, gs, all)
	return es, u.ents.ReplaceForStudent(studentID, es)
}

// Entitlements returns stored entitlements, rebuilding when none are stored
// yet (first read after deploy, legacy premium students).
func (u *PricingUsecase) Entitlements(studentID string) ([]domain.Entitlement, error) {
	es, err := u.ents.ListByStudent(studentID)
	if err != nil || len(es) > 0 {
		return es, err
	}
	return u.Rebuild(studentID)
}

// AccessFor builds the StudentAccess input for Decide.
func (u *PricingUsecase) AccessFor(studentID string, suspended bool) (StudentAccess, error) {
	es, err := u.Entitlements(studentID)
	if err != nil {
		return StudentAccess{}, err
	}
	m := make(map[string]domain.Entitlement, len(es))
	for _, e := range es {
		m[e.ProgramID] = e
	}
	return StudentAccess{Suspended: suspended, Entitlements: m}, nil
}

// EntitledPrograms returns the program ids with a live (or in-grace) entitlement.
func (u *PricingUsecase) EntitledPrograms(studentID string) map[string]bool {
	out := map[string]bool{}
	es, err := u.Entitlements(studentID)
	if err != nil {
		return out
	}
	for _, e := range es {
		if IsEntitled(e, u.now(), u.graceDays) {
			out[e.ProgramID] = true
		}
	}
	return out
}

// HasAnyAccess: interim contest gate until contests carry a Scope (Phase 2).
func (u *PricingUsecase) HasAnyAccess(studentID string) bool {
	es, err := u.Entitlements(studentID)
	if err != nil {
		return false
	}
	for _, e := range es {
		if IsEntitled(e, u.now(), u.graceDays) {
			return true
		}
	}
	return false
}

// AdminGrant records an admin grant of a plan as an Approved ledger row, so it
// is revocable and visible in the Payments screen.
func (u *PricingUsecase) AdminGrant(studentID, planID, admin string) (*domain.PaymentRequest, error) {
	plan, err := u.plans.Get(planID)
	if err != nil {
		return nil, err
	}
	if plan == nil {
		return nil, ErrPlanNotFound
	}
	now := u.now().UTC()
	v := plan.Validity
	programs := plan.ProgramIDs
	if plan.AllPrograms {
		programs = nil
	}
	pr := &domain.PaymentRequest{
		ID: GenerateUniqueId(), UserID: studentID, FullName: admin, BankName: "Admin grant",
		Status: domain.StatusApproved, CreatedAt: now, UpdatedAt: now,
		PlanID: planID, ProgramIDs: programs, Validity: &v, Currency: domain.CurrencyETB,
		ExpirationDate: planExpiry(v, now),
	}
	if err := u.payments.Create(pr); err != nil {
		return nil, err
	}
	_, err = u.Rebuild(studentID)
	return pr, err
}
