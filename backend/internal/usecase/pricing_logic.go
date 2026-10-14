package usecase

import (
	"errors"
	"sort"
	"strings"
	"time"

	"victory-contest-go/internal/domain"
)

// Pure pricing / entitlement rules (plan §5.12). No I/O so they are table-
// testable; repositories and handlers call into these.

var (
	ErrNoPriceForCurrency = errors.New("this plan has no price in that currency")
	ErrCouponInvalid      = errors.New("coupon is not valid for this plan")
	ErrCouponExpired      = errors.New("coupon is not active at this time")
	ErrCouponExhausted    = errors.New("coupon has reached its redemption limit")
	ErrCouponStudentLimit = errors.New("you have already used this coupon the maximum number of times")
	ErrCouponCurrency     = errors.New("fixed-amount coupons only apply to ETB")
)

func parseTime(s string) (time.Time, bool) {
	if strings.TrimSpace(s) == "" {
		return time.Time{}, false
	}
	t, err := time.Parse(time.RFC3339, s)
	return t, err == nil
}

// PlanCoversProgram: AllPrograms or the program is listed.
func PlanCoversProgram(p domain.PricePlan, programID string) bool {
	if p.AllPrograms {
		return true
	}
	for _, id := range p.ProgramIDs {
		if id == programID {
			return true
		}
	}
	return false
}

// PlanVisible: active and inside its visibility window.
func PlanVisible(p domain.PricePlan, now time.Time) bool {
	if !p.IsActive {
		return false
	}
	if t, ok := parseTime(p.VisibleFrom); ok && now.Before(t) {
		return false
	}
	if t, ok := parseTime(p.VisibleUntil); ok && now.After(t) {
		return false
	}
	return true
}

// PlansForProgram returns visible plans covering programID, ordered by
// SortOrder then name (paywall order, rule 8).
func PlansForProgram(plans []domain.PricePlan, programID string, now time.Time) []domain.PricePlan {
	out := make([]domain.PricePlan, 0, len(plans))
	for _, p := range plans {
		if PlanVisible(p, now) && PlanCoversProgram(p, programID) {
			out = append(out, p)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].SortOrder != out[j].SortOrder {
			return out[i].SortOrder < out[j].SortOrder
		}
		return out[i].Name < out[j].Name
	})
	return out
}

func moneyIn(list []domain.Money, currency string) (domain.Money, bool) {
	for _, m := range list {
		if m.Currency == currency {
			return m, true
		}
	}
	return domain.Money{}, false
}

// EffectivePrice is rule 1: the sale price while inside the sale window
// (start inclusive, end inclusive), otherwise the normal price.
func EffectivePrice(p domain.PricePlan, currency string, now time.Time) (domain.Money, error) {
	base, ok := moneyIn(p.Prices, currency)
	if !ok {
		return domain.Money{}, ErrNoPriceForCurrency
	}
	if p.Sale != nil {
		s, sok := parseTime(p.Sale.StartsAt)
		e, eok := parseTime(p.Sale.EndsAt)
		if sok && eok && !now.Before(s) && !now.After(e) {
			if sale, ok := moneyIn(p.Sale.Prices, currency); ok {
				return sale, nil
			}
		}
	}
	return base, nil
}

// Quote is what the server tells the student before they pay.
type Quote struct {
	PlanID      string          `json:"plan_id"`
	Currency    string          `json:"currency"`
	ListAmount  int64           `json:"list_amount"` // strike-through or price before coupon
	Price       int64           `json:"price"`       // effective plan price before coupon
	Discount    int64           `json:"discount"`
	Final       int64           `json:"final"`
	Free        bool            `json:"free"` // coupon made it free -> auto-approved, no proof
	CouponCode  string          `json:"coupon_code,omitempty"`
	Validity    domain.Validity `json:"validity"`
	ProgramIDs  []string        `json:"program_ids"`
	AllPrograms bool            `json:"all_programs"`
}

// ValidateCoupon checks a coupon for a plan at a time. redeemedByStudent is
// how often THIS student already redeemed it.
func ValidateCoupon(c domain.Coupon, p domain.PricePlan, currency string, now time.Time, redeemedByStudent int) error {
	if !c.IsActive {
		return ErrCouponExpired
	}
	if t, ok := parseTime(c.StartsAt); ok && now.Before(t) {
		return ErrCouponExpired
	}
	if t, ok := parseTime(c.EndsAt); ok && now.After(t) {
		return ErrCouponExpired
	}
	if c.MaxRedemptions > 0 && c.Redeemed >= c.MaxRedemptions {
		return ErrCouponExhausted
	}
	if c.PerStudentLimit > 0 && redeemedByStudent >= c.PerStudentLimit {
		return ErrCouponStudentLimit
	}
	if c.Kind == domain.CouponFixed && currency != domain.CurrencyETB {
		return ErrCouponCurrency
	}
	if len(c.PlanIDs) > 0 || len(c.ProgramIDs) > 0 {
		match := false
		for _, id := range c.PlanIDs {
			if id == p.ID {
				match = true
			}
		}
		for _, pid := range c.ProgramIDs {
			if PlanCoversProgram(p, pid) {
				match = true
			}
		}
		if !match {
			return ErrCouponInvalid
		}
	}
	if c.Kind != domain.CouponPercent && c.Kind != domain.CouponFixed {
		return ErrCouponInvalid
	}
	return nil
}

// BuildQuote implements rules 1, 2 and 5: sale price, then coupon, never below
// zero; a 100% (or covering) coupon yields Free.
func BuildQuote(p domain.PricePlan, currency string, coupon *domain.Coupon, now time.Time, redeemedByStudent int) (Quote, error) {
	price, err := EffectivePrice(p, currency, now)
	if err != nil {
		return Quote{}, err
	}
	q := Quote{
		PlanID: p.ID, Currency: currency, Price: price.Amount, ListAmount: price.Amount,
		Validity: p.Validity, ProgramIDs: p.ProgramIDs, AllPrograms: p.AllPrograms,
	}
	if list, ok := moneyIn(p.ListPrices, currency); ok && list.Amount > price.Amount {
		q.ListAmount = list.Amount
	}
	if coupon != nil {
		if err := ValidateCoupon(*coupon, p, currency, now, redeemedByStudent); err != nil {
			return Quote{}, err
		}
		var d int64
		switch coupon.Kind {
		case domain.CouponPercent:
			pct := coupon.Value
			if pct < 0 {
				pct = 0
			}
			if pct > 100 {
				pct = 100
			}
			d = (price.Amount*pct + 50) / 100 // round half up
		case domain.CouponFixed:
			d = coupon.Value
		}
		if d > price.Amount {
			d = price.Amount
		}
		if d < 0 {
			d = 0
		}
		q.Discount = d
		q.CouponCode = strings.ToUpper(strings.TrimSpace(coupon.Code))
	}
	q.Final = q.Price - q.Discount
	q.Free = q.Final == 0 && coupon != nil
	return q, nil
}

// Grant is one approved, non-revoked payment or admin grant fed to
// RebuildEntitlements.
type Grant struct {
	ProgramIDs []string
	PlanID     string
	Source     string
	ApprovedAt time.Time
	Validity   domain.Validity
}

// RebuildEntitlements recomputes a student's entitlements from all grants,
// oldest first (rule 6): `days` plans start at max(approval, current expiry)
// so early renewal adds time; `fixed_end` sets the later of current expiry and
// the plan's end date; `lifetime` never expires. Deterministic and idempotent.
// allProgramIDs expands AllPrograms grants to the programs that exist now.
func RebuildEntitlements(studentID string, grants []Grant, allProgramIDs []string) []domain.Entitlement {
	sorted := append([]Grant(nil), grants...)
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].ApprovedAt.Before(sorted[j].ApprovedAt) })

	type state struct {
		expires  time.Time
		lifetime bool
		source   string
		plan     string
	}
	byProgram := map[string]*state{}
	for _, g := range sorted {
		programs := g.ProgramIDs
		if len(programs) == 0 {
			programs = allProgramIDs
		}
		for _, pid := range programs {
			st := byProgram[pid]
			if st == nil {
				st = &state{}
				byProgram[pid] = st
			}
			st.source, st.plan = g.Source, g.PlanID
			if st.lifetime {
				continue
			}
			switch g.Validity.Type {
			case domain.ValidityLifetime:
				st.lifetime = true
			case domain.ValidityFixedEnd:
				if end, ok := parseTime(g.Validity.EndsAt); ok && end.After(st.expires) {
					st.expires = end
				}
			default: // days
				start := g.ApprovedAt
				if st.expires.After(start) {
					start = st.expires
				}
				days := g.Validity.Days
				if days <= 0 {
					days = 30
				}
				st.expires = start.AddDate(0, 0, days)
			}
		}
	}
	out := make([]domain.Entitlement, 0, len(byProgram))
	for pid, st := range byProgram {
		e := domain.Entitlement{
			ID: domain.EntitlementID(studentID, pid), StudentID: studentID, ProgramID: pid,
			Source: st.source, LastPlanID: st.plan,
		}
		if !st.lifetime {
			e.ExpiresAt = st.expires.UTC().Format(time.RFC3339)
		}
		out = append(out, e)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ProgramID < out[j].ProgramID })
	return out
}
