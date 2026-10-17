package domain

type Contest struct {
	ID          string   `json:"id"                 dynamodbav:"id"`
	Title       string   `json:"title"              dynamodbav:"title"`
	Description string   `json:"description"        dynamodbav:"description"`
	StartTime   string   `json:"start_time"         dynamodbav:"start_time"`
	EndTime     string   `json:"end_time"           dynamodbav:"end_time"`
	Subject     string   `json:"subject"            dynamodbav:"subject"`
	Grade       string   `json:"grade"              dynamodbav:"grade"`
	Prize       string   `json:"prize"              dynamodbav:"prize"`
	Questions   []string `json:"questions"          dynamodbav:"questions"`
	Status      string   `json:"status"               dynamodbav:"status"`
	Type        string   `json:"type"  dynamodbav:"type"`
	// Scope (optional, Phase 1): which program/stream the contest belongs to.
	// When set, premium access is decided per program via usecase.Decide.
	Scope *Scope `json:"scope,omitempty" dynamodbav:"scope,omitempty"`

	// Phase 2 (plan §5.4.1) — all optional; legacy rows keep working.
	Kind               string `json:"kind,omitempty"                 dynamodbav:"kind,omitempty"`             // contest|practice|entrance|past_exam|makeup|other (default contest)
	Mode               string `json:"mode,omitempty"                 dynamodbav:"mode,omitempty"`             // self_paced|global (empty on legacy rows => global)
	DurationMinutes    int    `json:"duration_minutes,omitempty"     dynamodbav:"duration_minutes,omitempty"` // per-student limit; required for self_paced
	LatePenaltyPercent int    `json:"late_penalty_percent"           dynamodbav:"late_penalty_percent"`       // 0-100, default 10 (self_paced only)
	Reveal             string `json:"reveal,omitempty"               dynamodbav:"reveal,omitempty"`           // at_end | on_submit
	ShuffleQuestions   bool   `json:"shuffle_questions"              dynamodbav:"shuffle_questions"`
	ShuffleOptions     bool   `json:"shuffle_options"                dynamodbav:"shuffle_options"`
	Year               string `json:"year,omitempty"                 dynamodbav:"year,omitempty"`
	Source             string `json:"source,omitempty"               dynamodbav:"source,omitempty"`
}

// Phase 2 contest enums (plan §5.4.1).
const (
	ContestModeGlobal    = "global"
	ContestModeSelfPaced = "self_paced"

	ContestKindContest  = "contest"
	ContestKindPractice = "practice"
	ContestKindEntrance = "entrance"
	ContestKindPastExam = "past_exam"
	ContestKindMakeup   = "makeup"
	ContestKindOther    = "other"

	RevealAtEnd    = "at_end"
	RevealOnSubmit = "on_submit"

	DefaultLatePenaltyPercent = 10
)

// EffectiveMode reads legacy rows (empty mode) as global.
func (c Contest) EffectiveMode() string {
	if c.Mode == ContestModeSelfPaced {
		return ContestModeSelfPaced
	}
	return ContestModeGlobal
}

// EffectiveKind defaults to "contest".
func (c Contest) EffectiveKind() string {
	if c.Kind == "" {
		return ContestKindContest
	}
	return c.Kind
}

// NeedsRegistration is the two kinds students sign up for. Practice and past
// exams are study material you open and do; the legacy contest page only ever
// served the competing kinds, so their roster rows stay meaningful.
func (c Contest) NeedsRegistration() bool {
	switch c.EffectiveKind() {
	case ContestKindPractice, ContestKindPastExam:
		return false
	}
	return true
}

// EffectiveReveal applies the per-kind default (plan §5.4.1).
func (c Contest) EffectiveReveal() string {
	if c.Reveal == RevealAtEnd || c.Reveal == RevealOnSubmit {
		return c.Reveal
	}
	switch c.EffectiveKind() {
	case ContestKindPractice, ContestKindPastExam:
		return RevealOnSubmit
	}
	return RevealAtEnd
}

type ContestAnnouncementRequest struct {
	Message string `json:"message" form:"message"`
	File    string `json:"file" form:"file"` // File path or URL if a file was uploaded alongside the announcement
}
type ContestTypeWithQuestionObj struct {
	Contest
	Questions []Question `json:"questions"`
	// QuestionIDs is the raw stored question-id list. The embedded Contest's
	// Questions field is shadowed by the hydrated Questions above, so a client
	// reading this payload cannot otherwise tell how many questions a round
	// linked before any were archived away.
	QuestionIDs []string `json:"question_ids,omitempty"`
}

// ContestPatch carries the Phase 2 fields of PATCH /contest/:id with pointer
// fields (nil = not provided), replacing reflection-based field copying (D11).
type ContestPatch struct {
	Kind               *string `json:"kind"`
	Mode               *string `json:"mode"`
	DurationMinutes    *int    `json:"duration_minutes"`
	LatePenaltyPercent *int    `json:"late_penalty_percent"`
	Reveal             *string `json:"reveal"`
	ShuffleQuestions   *bool   `json:"shuffle_questions"`
	ShuffleOptions     *bool   `json:"shuffle_options"`
	Year               *string `json:"year"`
	Source             *string `json:"source"`
	Scope              *Scope  `json:"scope"`
	ClearScope         bool    `json:"clear_scope"`
}

// Apply copies the provided fields onto c and reports whether any was provided.
func (p ContestPatch) Apply(c *Contest) bool {
	any := false
	if p.Kind != nil {
		c.Kind = *p.Kind
		any = true
	}
	if p.Mode != nil {
		c.Mode = *p.Mode
		any = true
	}
	if p.DurationMinutes != nil {
		c.DurationMinutes = *p.DurationMinutes
		any = true
	}
	if p.LatePenaltyPercent != nil {
		c.LatePenaltyPercent = *p.LatePenaltyPercent
		any = true
	}
	if p.Reveal != nil {
		c.Reveal = *p.Reveal
		any = true
	}
	if p.ShuffleQuestions != nil {
		c.ShuffleQuestions = *p.ShuffleQuestions
		any = true
	}
	if p.ShuffleOptions != nil {
		c.ShuffleOptions = *p.ShuffleOptions
		any = true
	}
	if p.Year != nil {
		c.Year = *p.Year
		any = true
	}
	if p.Source != nil {
		c.Source = *p.Source
		any = true
	}
	if p.ClearScope {
		c.Scope = nil
		any = true
	} else if p.Scope != nil {
		s := *p.Scope
		c.Scope = &s
		any = true
	}
	return any
}
