package usecase

import (
	"sort"
	"strconv"
	"strings"

	"victory-contest-go/internal/domain"
)

// Feed implements GET /api/feed (plan §5.7): one aggregate read that replaces
// "download every contest and filter in the browser". It composes the existing
// read paths (assessments, academy subjects, leaderboards) so every rule they
// enforce (scope matching, lock objects, enrolment-only boards) still applies.

const (
	FeedMine       = "mine" // all of the student's enrolled programs
	FeedStreamAll  = "all"  // explore: widen to every stream of the program
	feedPageSize   = 20
	feedBoardLimit = 3 // programs shown in the leaderboards section
	feedBoardTop   = 3 // entries per board preview
)

// FeedLecture is an Academy subject card with the student's progress and its lock count.
type FeedLecture struct {
	AcademySubjectView
	Scope  domain.Scope `json:"scope"`
	Access string       `json:"access"` // free | mixed | premium (from locked_modules)
}

// FeedBoard is a small leaderboard preview for one program/stream.
type FeedBoard struct {
	ProgramID string              `json:"program_id"`
	StreamID  string              `json:"stream_id,omitempty"`
	Period    string              `json:"period"`
	Top       []domain.BoardEntry `json:"top"`
	Me        *domain.BoardEntry  `json:"me,omitempty"`
}

type FeedView struct {
	ProgramID    string           `json:"program_id"` // resolved program ("mine" when widened to all enrolments)
	StreamID     string           `json:"stream_id"`  // resolved stream filter ("" = own stream + common)
	Mine         bool             `json:"mine"`       // true when every filtered program is one the student is enrolled in
	Programs     []string         `json:"programs"`   // program ids actually queried
	Assessments  []AssessmentMeta `json:"assessments"`
	Lectures     []FeedLecture    `json:"lectures"`
	Leaderboards []FeedBoard      `json:"leaderboards"`
	NextCursor   string           `json:"next_cursor,omitempty"`
}

type FeedQuery struct {
	Program, Stream, Subject, Kind, Access, Cursor string
}

// FeedSources are the existing read paths the feed composes; function fields keep
// the usecase testable with plain fakes.
type FeedSources struct {
	Student        func(id string) (*domain.Student, error)
	Assessments    func(studentID string, f domain.ScopeFilter) ([]AssessmentMeta, error)
	Subjects       func(studentID, program, stream string) ([]AcademySubjectView, error)
	Board          func(studentID, period, program, stream string) (*BoardView, error)
	ActivePrograms func() []string // optional: ids of active programs (validates explore targets)
}

type FeedUsecase struct{ src FeedSources }

func NewFeedUsecase(src FeedSources) *FeedUsecase { return &FeedUsecase{src: src} }

func streamFor(st *domain.Student, program string) string {
	for _, e := range st.Enrollments {
		if e.ProgramID == program {
			return e.StreamID
		}
	}
	return ""
}

func enrolled(st *domain.Student, program string) bool {
	for _, e := range st.Enrollments {
		if e.ProgramID == program {
			return true
		}
	}
	return false
}

// resolvePrograms turns the `program` query into the programs to read.
func (u *FeedUsecase) resolvePrograms(st *domain.Student, program string) ([]string, string) {
	switch program {
	case FeedMine:
		ids := []string{}
		for _, e := range st.Enrollments {
			ids = append(ids, e.ProgramID)
		}
		if len(ids) == 0 && st.PrimaryProgramID != "" {
			ids = append(ids, st.PrimaryProgramID)
		}
		return ids, FeedMine
	case "":
		p := st.PrimaryProgramID
		if p == "" && len(st.Enrollments) > 0 {
			p = st.Enrollments[0].ProgramID
		}
		if p == "" {
			return []string{}, ""
		}
		return []string{p}, p
	default:
		return []string{program}, program
	}
}

func (u *FeedUsecase) Feed(studentID string, q FeedQuery) (*FeedView, error) {
	st, err := u.src.Student(studentID)
	if err != nil || st == nil {
		return nil, ErrBoardForbidden
	}
	programs, resolved := u.resolvePrograms(st, strings.TrimSpace(q.Program))
	view := &FeedView{
		ProgramID: resolved, StreamID: q.Stream, Programs: programs,
		Assessments: []AssessmentMeta{}, Lectures: []FeedLecture{}, Leaderboards: []FeedBoard{},
	}
	if len(programs) == 0 {
		return view, nil
	}
	view.Mine = true
	for _, p := range programs {
		if !enrolled(st, p) {
			view.Mine = false
		}
	}

	// Stream rule: default = the student's stream in that program plus common;
	// explicit stream narrows; "all" widens (Explore).
	f := domain.ScopeFilter{ProgramIDs: programs, SubjectID: q.Subject}
	streams := map[string]bool{}
	switch {
	case q.Stream == FeedStreamAll:
		// no stream filter
	case q.Stream != "":
		f.StreamIDs = []string{q.Stream, domain.StreamCommon}
	default:
		for _, p := range programs {
			if s := streamFor(st, p); s != "" {
				streams[s] = true
			}
		}
		if len(streams) > 0 {
			streams[domain.StreamCommon] = true
			for s := range streams {
				f.StreamIDs = append(f.StreamIDs, s)
			}
			sort.Strings(f.StreamIDs)
		}
	}

	// Assessments: server-side scope filter + kind/access filter, paged by offset cursor.
	if u.src.Assessments != nil {
		list, err := u.src.Assessments(studentID, f)
		if err != nil {
			return nil, err
		}
		filtered := make([]AssessmentMeta, 0, len(list))
		for _, a := range list {
			if q.Kind != "" && a.Kind != q.Kind {
				continue
			}
			if q.Access != "" && feedAccess(a.Access) != q.Access {
				continue
			}
			filtered = append(filtered, a)
		}
		off, _ := strconv.Atoi(q.Cursor)
		if off < 0 || off > len(filtered) {
			off = 0
		}
		end := off + feedPageSize
		if end < len(filtered) {
			view.NextCursor = strconv.Itoa(end)
		} else {
			end = len(filtered)
		}
		view.Assessments = filtered[off:end]
	}

	// Lectures (Academy subjects) and leaderboards are first-page content only.
	if q.Cursor == "" {
		for _, p := range programs {
			stream := q.Stream
			if stream == FeedStreamAll {
				stream = ""
			} else if stream == "" {
				stream = streamFor(st, p)
			}
			if u.src.Subjects != nil {
				subs, err := u.src.Subjects(studentID, p, stream)
				if err == nil {
					for _, s := range subs {
						if q.Subject != "" && s.ID != q.Subject {
							continue
						}
						acc := "free"
						switch {
						case s.TotalModulesCount > 0 && s.LockedModules >= s.TotalModulesCount:
							acc = "premium"
						case s.LockedModules > 0:
							acc = "mixed"
						}
						if q.Access != "" && acc != q.Access && !(q.Access == "premium" && acc == "mixed") {
							continue
						}
						view.Lectures = append(view.Lectures, FeedLecture{
							AcademySubjectView: s,
							Scope:              domain.Scope{ProgramID: p, StreamID: s.StreamID, SubjectID: s.ID},
							Access:             acc,
						})
					}
				}
			}
		}
		if u.src.Board != nil {
			for i, p := range programs {
				if i >= feedBoardLimit || !enrolled(st, p) {
					continue // boards are enrolment-only (plan §5.5)
				}
				stream := streamFor(st, p)
				if stream == domain.StreamCommon {
					stream = ""
				}
				b, err := u.src.Board(studentID, domain.PeriodWeek, p, stream)
				if err != nil || b == nil {
					continue
				}
				top := b.Entries
				if len(top) > feedBoardTop {
					top = top[:feedBoardTop]
				}
				view.Leaderboards = append(view.Leaderboards, FeedBoard{
					ProgramID: p, StreamID: stream, Period: domain.PeriodWeek, Top: top, Me: b.Me,
				})
			}
		}
	}
	return view, nil
}

func feedAccess(t string) string {
	if t == "premium" || t == "paid" {
		return "premium"
	}
	return "free"
}
