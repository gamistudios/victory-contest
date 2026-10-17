package usecase

import (
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"victory-contest-go/internal/domain"
)

// ErrBadAnalyticsRange is returned for an unparseable or inverted date range.
var ErrBadAnalyticsRange = errors.New("invalid date range")

// AttemptAnalyticsSource lists finalised attempts submitted inside a range.
// It is optional on the attempt repository (satisfied by the Dynamo repo) so
// existing fakes of AttemptRepository keep compiling.
type AttemptAnalyticsSource interface {
	ListFinalisedBetween(fromRFC3339, toRFC3339 string) ([]domain.Attempt, error)
}

// parseRangeBound turns YYYY-MM-DD or RFC 3339 into a time. endOfDay makes a
// bare date inclusive of that whole day.
func parseRangeBound(s string, endOfDay bool) (time.Time, bool, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, false, nil
	}
	if t, err := time.Parse("2006-01-02", s); err == nil {
		if endOfDay {
			t = t.Add(24*time.Hour - time.Nanosecond)
		}
		return t.UTC(), true, nil
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.UTC(), true, nil
	}
	return time.Time{}, false, ErrBadAnalyticsRange
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }

func attemptPercent(a domain.Attempt) (float64, bool) {
	if a.Total <= 0 {
		return 0, false
	}
	return float64(a.Correct) * 100 / float64(a.Total), true
}

// analyticsEligible: only finished, counted attempts feed analytics.
func analyticsEligible(a domain.Attempt) bool {
	return a.Finalised() && !a.Excluded && a.Status != domain.AttemptAbandoned
}

// attemptInScope applies the shared ScopeFilter to an attempt. Unscoped
// (legacy) attempts only appear when no scope constraint is set. The student's
// own stream also constrains common-scope assessments, so a Natural Science
// filter does not pick up a Social Science student's common attempt.
func attemptInScope(a domain.Attempt, f domain.ScopeFilter) bool {
	constrained := len(f.ProgramIDs) > 0 || len(f.StreamIDs) > 0 || f.SubjectID != "" || f.ChapterID != ""
	if a.Scope == nil {
		return !constrained
	}
	if !a.Scope.Matches(f) {
		return false
	}
	if len(f.StreamIDs) > 0 && a.Scope.StreamID == domain.StreamCommon &&
		a.StudentStreamID != "" && a.StudentStreamID != domain.StreamCommon && !containsString(f.StreamIDs, a.StudentStreamID) {
		return false
	}
	return true
}

func containsString(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

type bucketAgg struct {
	bucket   domain.AnalyticsBucket
	students map[string]struct{}
	sumPct   float64
	passed   int
	points   int
}

type cellAgg struct {
	cell     domain.CompetencyCell
	students map[string]struct{}
}

func regionOf(s domain.Student) string {
	if r := strings.TrimSpace(s.Region); r != "" {
		return r
	}
	if r := strings.TrimSpace(s.RegionID); r != "" {
		return r
	}
	return "Unknown"
}

// BuildScopeAnalytics is the pure aggregation over attempts (unit-testable
// without storage). studentRegion maps a student id to a region label.
func BuildScopeAnalytics(attempts []domain.Attempt, studentRegion map[string]string, q domain.AnalyticsQuery, now time.Time) *domain.ScopeAnalytics {
	out := &domain.ScopeAnalytics{
		From: q.From, To: q.To,
		ProgramIDs: q.Filter.ProgramIDs, StreamIDs: q.Filter.StreamIDs,
		SubjectID: q.Filter.SubjectID, ChapterID: q.Filter.ChapterID,
		ByProgram: []domain.AnalyticsBucket{}, ByStream: []domain.AnalyticsBucket{},
		BySubject: []domain.AnalyticsBucket{}, ByRegion: []domain.AnalyticsBucket{},
		Competency: []domain.CompetencyCell{}, SummarySource: "rule_based_stub",
		GeneratedAt: now.UTC().Format(time.RFC3339),
	}
	bins := make([]domain.DistributionBin, 10)
	for i := range bins {
		bins[i] = domain.DistributionBin{From: i * 10, To: i*10 + 9}
	}
	bins[9].To = 100

	var (
		program = map[string]*bucketAgg{}
		stream  = map[string]*bucketAgg{}
		subject = map[string]*bucketAgg{}
		region  = map[string]*bucketAgg{}
		cells   = map[string]*cellAgg{}
		all     = map[string]struct{}{}
		pcts    []float64
		sumPct  float64
		passed  int
	)
	touch := func(m map[string]*bucketAgg, key string, init domain.AnalyticsBucket, a domain.Attempt, pct float64) {
		g := m[key]
		if g == nil {
			init.Key = key
			g = &bucketAgg{bucket: init, students: map[string]struct{}{}}
			m[key] = g
		}
		g.bucket.Attempts++
		g.students[a.StudentID] = struct{}{}
		g.sumPct += pct
		g.points += a.Points
		if pct >= domain.PassMarkPercent {
			g.passed++
		}
	}

	for _, a := range attempts {
		if !analyticsEligible(a) || !attemptInScope(a, q.Filter) {
			continue
		}
		pct, ok := attemptPercent(a)
		if !ok {
			continue
		}
		prog, strm, subj, chap := "unscoped", "", "", ""
		if a.Scope != nil {
			prog, subj, chap = a.Scope.ProgramID, a.Scope.SubjectID, a.Scope.ChapterID
		}
		strm = streamOf(a)

		out.Totals.Attempts++
		out.Totals.TotalPoints += a.Points
		all[a.StudentID] = struct{}{}
		pcts = append(pcts, pct)
		sumPct += pct
		if pct >= domain.PassMarkPercent {
			passed++
		}
		bin := int(pct) / 10
		if bin > 9 {
			bin = 9
		}
		bins[bin].Count++

		touch(program, prog, domain.AnalyticsBucket{ProgramID: prog}, a, pct)
		if strm != "" {
			touch(stream, prog+"/"+strm, domain.AnalyticsBucket{ProgramID: prog, StreamID: strm}, a, pct)
		}
		if subj != "" {
			touch(subject, prog+"/"+subj, domain.AnalyticsBucket{ProgramID: prog, SubjectID: subj}, a, pct)
			ck := prog + "/" + subj + "/" + chap
			c := cells[ck]
			if c == nil {
				c = &cellAgg{cell: domain.CompetencyCell{ProgramID: prog, SubjectID: subj, ChapterID: chap}, students: map[string]struct{}{}}
				cells[ck] = c
			}
			c.cell.Attempts++
			c.cell.Correct += a.Correct
			c.cell.Total += a.Total
			c.students[a.StudentID] = struct{}{}
		}
		reg := studentRegion[a.StudentID]
		if reg == "" {
			reg = "Unknown"
		}
		touch(region, strings.ToLower(reg), domain.AnalyticsBucket{Region: reg}, a, pct)
	}

	out.Distribution = bins
	out.Totals.Students = len(all)
	if n := len(pcts); n > 0 {
		out.Totals.AvgPercent = round1(sumPct / float64(n))
		out.Totals.PassRate = round1(float64(passed) * 100 / float64(n))
		sort.Float64s(pcts)
		if n%2 == 1 {
			out.Totals.MedianPercent = round1(pcts[n/2])
		} else {
			out.Totals.MedianPercent = round1((pcts[n/2-1] + pcts[n/2]) / 2)
		}
	}
	flush := func(m map[string]*bucketAgg) []domain.AnalyticsBucket {
		list := make([]domain.AnalyticsBucket, 0, len(m))
		for _, g := range m {
			b := g.bucket
			b.Students = len(g.students)
			if b.Attempts > 0 {
				b.AvgPercent = round1(g.sumPct / float64(b.Attempts))
				b.PassRate = round1(float64(g.passed) * 100 / float64(b.Attempts))
				b.AvgPoints = round1(float64(g.points) / float64(b.Attempts))
			}
			list = append(list, b)
		}
		sort.Slice(list, func(i, j int) bool {
			if list[i].Attempts != list[j].Attempts {
				return list[i].Attempts > list[j].Attempts
			}
			return list[i].Key < list[j].Key
		})
		return list
	}
	out.ByProgram, out.ByStream = flush(program), flush(stream)
	out.BySubject, out.ByRegion = flush(subject), flush(region)
	for _, c := range cells {
		cc := c.cell
		cc.Students = len(c.students)
		if cc.Total > 0 {
			cc.Mastery = round1(float64(cc.Correct) * 100 / float64(cc.Total))
		}
		out.Competency = append(out.Competency, cc)
	}
	sort.Slice(out.Competency, func(i, j int) bool {
		a, b := out.Competency[i], out.Competency[j]
		if a.ProgramID != b.ProgramID {
			return a.ProgramID < b.ProgramID
		}
		if a.SubjectID != b.SubjectID {
			return a.SubjectID < b.SubjectID
		}
		return a.ChapterID < b.ChapterID
	})
	out.Summary = summarizeAnalytics(out)
	return out
}

// summarizeAnalytics is the stubbed "AI summary": deterministic text built
// from the aggregates, so it is always consistent with the numbers beside it.
func summarizeAnalytics(a *domain.ScopeAnalytics) string {
	if a.Totals.Attempts == 0 {
		return "No finished attempts match this scope and date range."
	}
	parts := []string{fmt.Sprintf("%d attempts by %d students: average %.1f%%, median %.1f%%, pass rate %.1f%%.",
		a.Totals.Attempts, a.Totals.Students, a.Totals.AvgPercent, a.Totals.MedianPercent, a.Totals.PassRate)}
	var weakest *domain.CompetencyCell
	for i := range a.Competency {
		c := &a.Competency[i]
		if c.Total < 10 { // too few answers to call a weakness
			continue
		}
		if weakest == nil || c.Mastery < weakest.Mastery {
			weakest = c
		}
	}
	if weakest != nil {
		label := weakest.SubjectID
		if weakest.ChapterID != "" {
			label += " / " + weakest.ChapterID
		}
		parts = append(parts, fmt.Sprintf("Lowest mastery: %s at %.1f%% (%s).", label, weakest.Mastery, weakest.ProgramID))
	}
	if len(a.ByRegion) > 0 {
		parts = append(parts, fmt.Sprintf("Most active region: %s (%d attempts).", a.ByRegion[0].Region, a.ByRegion[0].Attempts))
	}
	return strings.Join(parts, " ")
}

// computeScopeAnalytics loads the attempts and the student regions and
// aggregates them.
func (u *contestStatisticsUsecase) computeScopeAnalytics(q domain.AnalyticsQuery) (*domain.ScopeAnalytics, error) {
	if u.attempts == nil {
		return nil, errors.New("analytics source not configured")
	}
	from, hasFrom, err := parseRangeBound(q.From, false)
	if err != nil {
		return nil, err
	}
	to, hasTo, err := parseRangeBound(q.To, true)
	if err != nil {
		return nil, err
	}
	if hasFrom && hasTo && to.Before(from) {
		return nil, ErrBadAnalyticsRange
	}
	fromS, toS := "", ""
	if hasFrom {
		fromS = from.Format(time.RFC3339)
	}
	if hasTo {
		toS = to.Format(time.RFC3339)
	}
	attempts, err := u.attempts.ListFinalisedBetween(fromS, toS)
	if err != nil {
		return nil, fmt.Errorf("failed to load attempts: %w", err)
	}
	students, err := u.studentUsecase.GetStudents()
	if err != nil {
		return nil, fmt.Errorf("failed to get students: %w", err)
	}
	regions := make(map[string]string, len(students)*2)
	for _, s := range students {
		r := regionOf(s)
		regions[s.ID] = r
		if s.TelegramID != "" {
			regions[s.TelegramID] = r
		}
	}
	return BuildScopeAnalytics(attempts, regions, q, time.Now()), nil
}
