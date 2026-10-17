package domain

// StreamCommon marks content visible to every stream of a program (plan §5.1).
const StreamCommon = "common"

// Scope is the single categorisation struct stamped on questions, assessments,
// attempts and leaderboard rows (plan §5.2). There is deliberately no Grade:
// every grade is its own program.
type Scope struct {
	ProgramID string `json:"program_id"           dynamodbav:"program_id"`
	StreamID  string `json:"stream_id"            dynamodbav:"stream_id"` // "common" = every stream of the program
	SubjectID string `json:"subject_id,omitempty" dynamodbav:"subject_id,omitempty"`
	ChapterID string `json:"chapter_id,omitempty" dynamodbav:"chapter_id,omitempty"`
}

// ScopeFilter is a set of optional constraints; empty means "no constraint".
type ScopeFilter struct {
	ProgramIDs []string
	StreamIDs  []string
	SubjectID  string
	ChapterID  string
}

func containsStr(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

// Matches reports whether the scope satisfies every non-empty constraint of f.
// Common-stream content matches a stream filter for any stream, so a Natural
// Science filter still lists English/Maths tagged "common".
func (s Scope) Matches(f ScopeFilter) bool {
	if len(f.ProgramIDs) > 0 && !containsStr(f.ProgramIDs, s.ProgramID) {
		return false
	}
	if len(f.StreamIDs) > 0 && s.StreamID != StreamCommon && !containsStr(f.StreamIDs, s.StreamID) {
		return false
	}
	if f.SubjectID != "" && s.SubjectID != f.SubjectID {
		return false
	}
	if f.ChapterID != "" && s.ChapterID != f.ChapterID {
		return false
	}
	return true
}

// VisibleTo: same program AND (same stream OR content stream is "common").
func (s Scope) VisibleTo(e Enrollment) bool {
	if s.ProgramID == "" || s.ProgramID != e.ProgramID {
		return false
	}
	return s.StreamID == StreamCommon || s.StreamID == e.StreamID
}
