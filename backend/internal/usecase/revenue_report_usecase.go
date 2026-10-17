package usecase

import (
	"errors"
	"math"
	"sort"
	"strings"
	"sync"
	"time"

	"victory-contest-go/internal/domain"
)

// adminGrantBank marks ledger rows written by PricingUsecase.AdminGrant.
const adminGrantBank = "Admin grant"

// revenueCacheTTL matches the other admin aggregates: a rapid filter session
// does not re-scan the payments table every click.
const revenueCacheTTL = 30 * time.Second

// addisOffset: Ethiopia is UTC+3 all year (no DST), so months are bucketed in
// local time and a payment at 23:30 on the 30th lands in the right month.
var addisZone = time.FixedZone("EAT", 3*3600)

// RevenueReportUsecase builds revenue by program / plan / coupon / month from
// the payments ledger. It never writes.
type RevenueReportUsecase struct {
	payments PaymentRepository
	plans    PricePlanRepository
	now      func() time.Time

	mu    sync.Mutex
	cache map[string]*domain.RevenueReport
	at    map[string]time.Time
}

func NewRevenueReportUsecase(payments PaymentRepository, plans PricePlanRepository) *RevenueReportUsecase {
	return &RevenueReportUsecase{payments: payments, plans: plans, now: time.Now,
		cache: map[string]*domain.RevenueReport{}, at: map[string]time.Time{}}
}

type revShare struct {
	program string
	amount  int64
}

// splitWhole splits total across programs in whole units: equal shares, the
// remainder (one unit each) given to the first programs in sorted order. The
// parts always sum to total exactly.
func splitWhole(total int64, programs []string) []revShare {
	if len(programs) == 0 {
		return []revShare{{program: "all_programs", amount: total}}
	}
	ids := append([]string(nil), programs...)
	sort.Strings(ids)
	n := int64(len(ids))
	base, rem := total/n, total%n
	out := make([]revShare, len(ids))
	for i, id := range ids {
		amt := base
		if int64(i) < rem {
			amt++
		}
		out[i] = revShare{id, amt}
	}
	return out
}

// paymentAmountETB returns the whole-birr value of an approved ETB payment and
// whether it came from a legacy row (no plan snapshot).
func paymentAmountETB(p domain.PaymentRequest) (amount int64, legacy bool) {
	if p.PlanID != "" || p.FinalAmount > 0 {
		return p.FinalAmount, false
	}
	// Legacy row: only the student-reported transfer value exists.
	return int64(math.Round(p.Amount)), true
}

func approvalTime(p domain.PaymentRequest) time.Time {
	if !p.UpdatedAt.IsZero() {
		return p.UpdatedAt
	}
	return p.CreatedAt
}

func revenueCacheKey(q domain.RevenueQuery) string {
	ids := append([]string(nil), q.ProgramIDs...)
	sort.Strings(ids)
	return strings.Join(ids, ",") + "|" + q.From + "|" + q.To
}

// Report returns the revenue report for the query (cached for 30 s).
func (u *RevenueReportUsecase) Report(q domain.RevenueQuery) (*domain.RevenueReport, error) {
	key := revenueCacheKey(q)
	u.mu.Lock()
	if v, ok := u.cache[key]; ok && u.now().Sub(u.at[key]) < revenueCacheTTL {
		u.mu.Unlock()
		return v, nil
	}
	u.mu.Unlock()

	from, hasFrom, err := parseRangeBound(q.From, false)
	if err != nil {
		return nil, ErrBadAnalyticsRange
	}
	to, hasTo, err := parseRangeBound(q.To, true)
	if err != nil {
		return nil, ErrBadAnalyticsRange
	}
	if hasFrom && hasTo && to.Before(from) {
		return nil, ErrBadAnalyticsRange
	}
	if u.payments == nil {
		return nil, errors.New("payments source not configured")
	}
	all, err := u.payments.ListAll()
	if err != nil {
		return nil, err
	}
	planNames := map[string]string{}
	if u.plans != nil {
		if ps, perr := u.plans.List(); perr == nil {
			for _, p := range ps {
				planNames[p.ID] = p.Name
			}
		}
	}
	rep := BuildRevenueReport(all, planNames, q, from, hasFrom, to, hasTo, u.now())

	u.mu.Lock()
	u.cache[key] = rep
	u.at[key] = u.now()
	if len(u.cache) > 128 {
		for k, at := range u.at {
			if u.now().Sub(at) >= revenueCacheTTL {
				delete(u.cache, k)
				delete(u.at, k)
			}
		}
	}
	u.mu.Unlock()
	return rep, nil
}

type revAgg struct {
	label    string
	payments int
	revenue  int64
}

// BuildRevenueReport is the pure aggregation (unit-testable without storage).
func BuildRevenueReport(payments []domain.PaymentRequest, planNames map[string]string, q domain.RevenueQuery,
	from time.Time, hasFrom bool, to time.Time, hasTo bool, now time.Time) *domain.RevenueReport {

	rep := &domain.RevenueReport{From: q.From, To: q.To, ProgramIDs: q.ProgramIDs,
		ByProgram: []domain.RevenueRow{}, ByPlan: []domain.RevenueRow{}, ByCoupon: []domain.RevenueRow{}, ByMonth: []domain.RevenueRow{},
		GeneratedAt: now.UTC().Format(time.RFC3339)}
	want := map[string]bool{}
	for _, id := range q.ProgramIDs {
		want[id] = true
	}
	program, plan, coupon, month := map[string]*revAgg{}, map[string]*revAgg{}, map[string]*revAgg{}, map[string]*revAgg{}
	add := func(m map[string]*revAgg, key, label string, amount int64, count int) {
		a := m[key]
		if a == nil {
			a = &revAgg{label: label}
			m[key] = a
		}
		a.payments += count
		a.revenue += amount
	}

	for _, p := range payments {
		if p.Status != domain.StatusApproved {
			continue
		}
		at := approvalTime(p)
		if (hasFrom && at.Before(from)) || (hasTo && at.After(to)) {
			continue
		}
		// Admin grants and 100%-coupon activations move no money.
		if p.BankName == adminGrantBank || (p.FinalAmount == 0 && p.CouponCode != "" && p.PlanID != "") {
			rep.Totals.FreeGrants++
			continue
		}
		if p.Currency == domain.CurrencyXTR {
			if !p.Revoked {
				rep.Totals.StarsRevenue += p.FinalAmount
			}
			continue // stars are reported in totals only, never mixed into ETB groupings
		}
		amount, legacy := paymentAmountETB(p)
		if amount <= 0 {
			continue
		}
		shares := splitWhole(amount, p.ProgramIDs)
		if len(want) > 0 {
			kept := shares[:0:0]
			var sum int64
			for _, s := range shares {
				if want[s.program] {
					kept = append(kept, s)
					sum += s.amount
				}
			}
			if len(kept) == 0 {
				continue
			}
			shares, amount = kept, sum
		}
		if p.Revoked {
			rep.Totals.Refunded++
			rep.Totals.RefundedETB += amount
			continue
		}
		rep.Totals.Revenue += amount
		rep.Totals.Payments++
		if legacy {
			rep.Totals.LegacyPayments++
		}
		for i, s := range shares {
			count := 0
			if i == 0 {
				count = 1 // one payment, counted once even when split across programs
			}
			add(program, s.program, s.program, s.amount, count)
		}
		planKey, planLabel := p.PlanID, planNames[p.PlanID]
		if planKey == "" {
			planKey, planLabel = "legacy", "Legacy (pre-plans)"
		} else if planLabel == "" {
			planLabel = planKey + " (deleted plan)"
		}
		add(plan, planKey, planLabel, amount, 1)
		code := strings.ToUpper(strings.TrimSpace(p.CouponCode))
		if code == "" {
			add(coupon, "", "(no coupon)", amount, 1)
		} else {
			add(coupon, code, code, amount, 1)
		}
		mk := at.In(addisZone).Format("2006-01")
		add(month, mk, mk, amount, 1)
	}

	flush := func(m map[string]*revAgg, byKey bool) []domain.RevenueRow {
		rows := make([]domain.RevenueRow, 0, len(m))
		for k, a := range m {
			rows = append(rows, domain.RevenueRow{Key: k, Label: a.label, Payments: a.payments, Revenue: a.revenue})
		}
		sort.Slice(rows, func(i, j int) bool {
			if byKey { // months read chronologically
				return rows[i].Key < rows[j].Key
			}
			if rows[i].Revenue != rows[j].Revenue {
				return rows[i].Revenue > rows[j].Revenue
			}
			return rows[i].Key < rows[j].Key
		})
		return rows
	}
	rep.ByProgram, rep.ByPlan = flush(program, false), flush(plan, false)
	rep.ByCoupon, rep.ByMonth = flush(coupon, false), flush(month, true)
	return rep
}
