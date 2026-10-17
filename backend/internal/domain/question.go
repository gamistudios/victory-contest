package domain

type Question struct {
	ID             string   `json:"id"                 dynamodbav:"id"`
	QuestionText   string   `json:"question_text"      dynamodbav:"question_text"`
	Answer         int      `json:"answer"             dynamodbav:"answer"`
	QuestionImg    string   `json:"question_image"     dynamodbav:"question_img"`
	Explanation    string   `json:"explanation"        dynamodbav:"explanation"`
	ExplanationImg string   `json:"explanation_image"  dynamodbav:"explanation_image"`
	Subject        string   `json:"subject"            dynamodbav:"subject"`
	Grade          string   `json:"grade"              dynamodbav:"grade"`
	Chapter        string   `json:"chapter"            dynamodbav:"chapter"`
	MultipleChoice []string `json:"multiple_choice"    dynamodbav:"multiple_choice"`
	// OptionImages is aligned index-by-index with MultipleChoice: entry i is the
	// image URL for option i, or "" when that option is text-only. It is purely
	// additive and optional, so legacy rows (no attribute) unmarshal as nil and
	// grading (1-based index into MultipleChoice) is unaffected.
	OptionImages []string `json:"option_images"        dynamodbav:"option_images"`
	// Scope (optional, Phase 1): program/stream/subject/chapter this question belongs to.
	// Legacy rows have none and keep matching by the free-text grade/subject/chapter.
	Scope *Scope `json:"scope,omitempty" dynamodbav:"scope,omitempty"`
	// Phase 3 (plan 5.6): question-bank metadata, all optional.
	Topic      string `json:"topic,omitempty"       dynamodbav:"topic,omitempty"`
	Difficulty string `json:"difficulty,omitempty"  dynamodbav:"difficulty,omitempty"` // easy | medium | hard
	Year       int    `json:"year,omitempty"        dynamodbav:"year,omitempty"`
	Source     string `json:"source,omitempty"      dynamodbav:"source,omitempty"`
	Verified   bool   `json:"verified"              dynamodbav:"verified"`
	VerifiedBy string `json:"verified_by,omitempty" dynamodbav:"verified_by,omitempty"`
}

// QuestionPatch carries the fields provided by PATCH /question/:id. A nil
// pointer means "not provided — keep the stored value", so partial updates
// can no longer wipe the rest of the row (the old full-PutItem semantics did).
type QuestionPatch struct {
	QuestionText   *string   `json:"question_text"`
	Answer         *int      `json:"answer"`
	QuestionImg    *string   `json:"question_image"`
	Explanation    *string   `json:"explanation"`
	ExplanationImg *string   `json:"explanation_image"`
	Subject        *string   `json:"subject"`
	Grade          *string   `json:"grade"`
	Chapter        *string   `json:"chapter"`
	MultipleChoice *[]string `json:"multiple_choice"`
	// OptionImages, when non-nil, fully replaces the stored per-option image
	// URLs. Empty slice = clear all option images; nil = leave unchanged.
	OptionImages *[]string `json:"option_images"`
	// Scope replaces the stored scope when non-nil; ClearScope removes it.
	Scope      *Scope `json:"scope"`
	ClearScope bool   `json:"clear_scope"`
	// Phase 3 metadata.
	Topic      *string `json:"topic"`
	Difficulty *string `json:"difficulty"`
	Year       *int    `json:"year"`
	Source     *string `json:"source"`
	Verified   *bool   `json:"verified"`
	VerifiedBy *string `json:"verified_by"`
}

type AiPracticeSetting struct {
	Subject    string `json:"subject"`
	Topic      string `json:"topic"`
	Difficulty string `json:"difficulty"`
}

// AiChatExplainRequest is the body for the on-question AI tutor: the whole
// generated quiz (including each question's correct answer, for context)
// plus the question being explained and an optional follow-up question. The
// model is instructed to guide, never to reveal the focused question's answer.
type AiChatExplainRequest struct {
	Quiz    []Question `json:"quiz"`
	Focus   Question   `json:"focus"`
	AskText string     `json:"ask_text"`
}

type MultipleQuestionRequest struct {
	Questions []Question `json:"questions"`
}
