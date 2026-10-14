package usecase

import (
	"time"

	"victory-contest-go/internal/domain"
)

// Decision is the single answer to "can this student use this resource?"
// (plan §5.3). One function replaces the duplicated premium checks.
type Decision int

const (
	Allowed Decision = iota
	LockedPremium
	LockedReferral
	NotPublished
	Suspended
)

func (d Decision) String() string {
	switch d {
	case Allowed:
		return "allowed"
	case LockedPremium:
		return "locked_premium"
	case LockedReferral:
		return "locked_referral"
	case NotPublished:
		return "not_published"
	case Suspended:
		return "suspended"
	}
	return "unknown"
}

// Resource describes the item being accessed.
type Resource struct {
	Scope     domain.Scope
	Access    string // "free" | "premium"
	Published bool
	Referral  *domain.AcademyReferralUnlock // nil = none
}

// StudentAccess is the student-side input to Decide.
type StudentAccess struct {
	Suspended     bool
	Entitlements  map[string]domain.Entitlement // by program id
	ReferralCount int
}

// IsEntitled: an entitlement for the program that has not expired, allowing
// graceDays after expiry (decision 20). Empty ExpiresAt = lifetime.
func IsEntitled(e domain.Entitlement, now time.Time, graceDays int) bool {
	if e.ExpiresAt == "" {
		return true
	}
	t, ok := parseTime(e.ExpiresAt)
	if !ok {
		return false
	}
	return !now.After(t.AddDate(0, 0, graceDays))
}

// InGrace reports an entitlement that has expired but is still inside grace.
func InGrace(e domain.Entitlement, now time.Time, graceDays int) bool {
	if e.ExpiresAt == "" {
		return false
	}
	t, ok := parseTime(e.ExpiresAt)
	return ok && now.After(t) && !now.After(t.AddDate(0, 0, graceDays))
}

// Decide evaluates the rules in order (plan §5.3):
//
//	1 suspended  2 unpublished  3 free (even if not enrolled)  4 premium +
//	entitled to the resource's program  5 referral unlock met  6 locked.
func Decide(st StudentAccess, r Resource, now time.Time, graceDays int) Decision {
	if st.Suspended {
		return Suspended
	}
	if !r.Published {
		return NotPublished
	}
	if r.Access != domain.AcademyAccessPremium {
		return Allowed
	}
	if e, ok := st.Entitlements[r.Scope.ProgramID]; ok && IsEntitled(e, now, graceDays) {
		return Allowed
	}
	if r.Referral != nil && r.Referral.Enabled {
		if st.ReferralCount >= r.Referral.RequiredReferrals {
			return Allowed
		}
		return LockedReferral
	}
	return LockedPremium
}

// LockInfo is the uniform `lock` object every API response carries.
type LockInfo struct {
	State     string `json:"state"`  // "locked"
	Reason    string `json:"reason"` // premium | referral
	ProgramID string `json:"program_id"`
}

// LockFor returns nil when allowed, otherwise the lock object.
func LockFor(d Decision, programID string) *LockInfo {
	switch d {
	case LockedPremium:
		return &LockInfo{State: "locked", Reason: "premium", ProgramID: programID}
	case LockedReferral:
		return &LockInfo{State: "locked", Reason: "referral", ProgramID: programID}
	}
	return nil
}
