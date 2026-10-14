package usecase

import (
	"testing"
	"time"

	"victory-contest-go/internal/domain"
)

func TestDecideMatrix(t *testing.T) {
	now := ts("2026-10-15T00:00:00Z")
	active := domain.Entitlement{ProgramID: "grade-12", ExpiresAt: "2026-11-01T00:00:00Z"}
	graceE := domain.Entitlement{ProgramID: "grade-12", ExpiresAt: "2026-10-13T00:00:00Z"} // 2 days ago
	lapsed := domain.Entitlement{ProgramID: "grade-12", ExpiresAt: "2026-10-01T00:00:00Z"}
	life := domain.Entitlement{ProgramID: "grade-12"}
	mk := func(e *domain.Entitlement) StudentAccess {
		s := StudentAccess{Entitlements: map[string]domain.Entitlement{}}
		if e != nil {
			s.Entitlements[e.ProgramID] = *e
		}
		return s
	}
	free := Resource{Scope: domain.Scope{ProgramID: "grade-12"}, Access: "free", Published: true}
	prem := Resource{Scope: domain.Scope{ProgramID: "grade-12"}, Access: "premium", Published: true}
	other := Resource{Scope: domain.Scope{ProgramID: "training"}, Access: "premium", Published: true}
	ref := prem
	ref.Referral = &domain.AcademyReferralUnlock{Enabled: true, RequiredReferrals: 2}

	cases := []struct {
		name string
		st   StudentAccess
		r    Resource
		want Decision
	}{
		{"free to non-enrolled/no entitlement", mk(nil), free, Allowed},
		{"premium not entitled", mk(nil), prem, LockedPremium},
		{"premium entitled", mk(&active), prem, Allowed},
		{"premium lifetime", mk(&life), prem, Allowed},
		{"premium in grace", mk(&graceE), prem, Allowed},
		{"premium lapsed past grace", mk(&lapsed), prem, LockedPremium},
		{"grade-12 plan does not unlock training", mk(&active), other, LockedPremium},
		{"unpublished hidden", mk(&active), Resource{Scope: prem.Scope, Access: "free", Published: false}, NotPublished},
		{"referral met", StudentAccess{ReferralCount: 2}, ref, Allowed},
		{"referral not met", StudentAccess{ReferralCount: 1}, ref, LockedReferral},
		{"entitled beats referral lock", mk(&active), ref, Allowed},
	}
	for _, c := range cases {
		if got := Decide(c.st, c.r, now, domain.DefaultGraceDays); got != c.want {
			t.Errorf("%s: got %s want %s", c.name, got, c.want)
		}
	}
	susp := mk(&life)
	susp.Suspended = true
	if Decide(susp, free, now, 3) != Suspended {
		t.Error("suspended must win over free")
	}
	if LockFor(LockedPremium, "training").Reason != "premium" || LockFor(Allowed, "x") != nil || LockFor(LockedReferral, "g").Reason != "referral" {
		t.Error("LockFor wrong")
	}
	if !InGrace(graceE, now, 3) || InGrace(active, now, 3) || InGrace(life, now, 3) {
		t.Error("InGrace wrong")
	}
	_ = time.Now
}
