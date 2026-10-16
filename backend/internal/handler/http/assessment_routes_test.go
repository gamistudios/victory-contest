package http

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// Handler-level coverage for the Phase 2 routes (plan §10.6): the wiring, the
// HTTP status of every attempt-engine error, the body shapes the two apps
// parse, and who is allowed to call what. The lifecycle itself is proven in
// internal/usecase/attempt_usecase_test.go with an injected clock; these tests
// use wall-clock-relative contest times because AttemptUsecase.now is private.

const assessTestSecret = "assessment-test-secret"

// --- fakes ---------------------------------------------------------------

type fakeHTTPAttempts struct {
	rows map[string]*domain.Attempt
}

func (f *fakeHTTPAttempts) Create(a domain.Attempt) error {
	if _, ok := f.rows[a.ID]; ok {
		return usecase.ErrAlreadyAttempted
	}
	cp := a
	f.rows[a.ID] = &cp
	return nil
}
func (f *fakeHTTPAttempts) Get(id string) (*domain.Attempt, error) {
	if a, ok := f.rows[id]; ok {
		cp := *a
		return &cp, nil
	}
	return nil, nil
}
func (f *fakeHTTPAttempts) UpdateAnswers(id string, answers map[string]int, flagged []string, expectedVersion int) error {
	a, ok := f.rows[id]
	if !ok {
		return fmt.Errorf("missing")
	}
	if a.Status != domain.AttemptInProgress || a.AnswersVersion != expectedVersion {
		return usecase.ErrVersionConflict
	}
	a.Answers, a.Flagged, a.AnswersVersion = answers, flagged, expectedVersion+1
	return nil
}
func (f *fakeHTTPAttempts) Finalise(a domain.Attempt) error {
	cur, ok := f.rows[a.ID]
	if !ok || cur.Status != domain.AttemptInProgress {
		return usecase.ErrAttemptFinalised
	}
	cp := a
	f.rows[a.ID] = &cp
	return nil
}
func (f *fakeHTTPAttempts) Put(a domain.Attempt) error {
	cp := a
	f.rows[a.ID] = &cp
	return nil
}
func (f *fakeHTTPAttempts) Delete(id string) error { delete(f.rows, id); return nil }
func (f *fakeHTTPAttempts) ListByStudent(sid string) ([]domain.Attempt, error) {
	var out []domain.Attempt
	for _, a := range f.rows {
		if a.StudentID == sid {
			out = append(out, *a)
		}
	}
	return out, nil
}
func (f *fakeHTTPAttempts) ListByContest(cid string) ([]domain.Attempt, error) {
	var out []domain.Attempt
	for _, a := range f.rows {
		if a.ContestID == cid {
			out = append(out, *a)
		}
	}
	return out, nil
}
func (f *fakeHTTPAttempts) ListExpired(cutoff string) ([]domain.Attempt, error) {
	var out []domain.Attempt
	for _, a := range f.rows {
		if a.Status == domain.AttemptInProgress && a.ExpiresAt < cutoff {
			out = append(out, *a)
		}
	}
	return out, nil
}
func (f *fakeHTTPAttempts) CountsByContest() (map[string]int, error) {
	out := map[string]int{}
	for _, a := range f.rows {
		out[a.ContestID]++
	}
	return out, nil
}

type fakeHTTPContests struct {
	usecase.ContestRepository
	rows map[string]*domain.Contest
}

func (f *fakeHTTPContests) GetAllContests() ([]domain.Contest, error) {
	var out []domain.Contest
	for _, c := range f.rows {
		out = append(out, *c)
	}
	return out, nil
}
func (f *fakeHTTPContests) GetContestByID(id string) (*domain.Contest, error) {
	c, ok := f.rows[id]
	if !ok {
		return nil, nil
	}
	return c, nil
}

type fakeHTTPQuestions struct {
	usecase.QuestionRepository
	rows map[string]*domain.Question
}

func (f *fakeHTTPQuestions) GetQuestionByID(id string) (*domain.Question, error) {
	q, ok := f.rows[id]
	if !ok {
		return nil, nil
	}
	return q, nil
}

type fakeHTTPStudents struct {
	usecase.StudentRepository
	rows map[string]*domain.Student
}

func (f *fakeHTTPStudents) GetStudentByID(id string) (*domain.Student, error) {
	s, ok := f.rows[id]
	if !ok {
		return nil, nil
	}
	return s, nil
}

type fakeHTTPSubmissions struct {
	usecase.SubmissionRepository
	rows []domain.Submission
}

func (f *fakeHTTPSubmissions) AddSubmission(s domain.Submission) (string, error) {
	s.ID = fmt.Sprintf("sub-%d", len(f.rows)+1)
	f.rows = append(f.rows, s)
	return s.ID, nil
}
func (f *fakeHTTPSubmissions) DeleteSubmission(id string) error {
	for i, s := range f.rows {
		if s.ID == id {
			f.rows = append(f.rows[:i], f.rows[i+1:]...)
			return nil
		}
	}
	return nil
}
func (f *fakeHTTPSubmissions) GetSubmissionsByContest(string) ([]domain.Submission, error) {
	return f.rows, nil
}
func (f *fakeHTTPSubmissions) GetSubmissionsByStudent(string) ([]domain.Submission, error) {
	return f.rows, nil
}

// fakeHTTPRoster stands in for the contest-registration table, which the admin
// dashboard counts per contest and trends by RegisteredAt.
type fakeHTTPRoster struct {
	rows      map[string]*domain.ContestRegistration // keyed contest|student
	activated []string
	err       error
}

func regKeyOf(contestID, studentID string) string { return contestID + "|" + studentID }

func (r *fakeHTTPRoster) CheckRegistrationsByContestAndStudent(contestID, studentID string) (bool, error) {
	if r.err != nil {
		return false, r.err
	}
	_, ok := r.rows[regKeyOf(contestID, studentID)]
	return ok, nil
}

func (r *fakeHTTPRoster) Register(contestID, studentID string) error {
	if r.err != nil {
		return r.err
	}
	k := regKeyOf(contestID, studentID)
	if _, ok := r.rows[k]; ok {
		return nil
	}
	r.rows[k] = &domain.ContestRegistration{ID: "reg-" + k, ContestID: contestID, StudentID: studentID}
	return nil
}

func (r *fakeHTTPRoster) EnsureActive(contestID, studentID string) error {
	if r.err != nil {
		return r.err
	}
	k := regKeyOf(contestID, studentID)
	if reg, ok := r.rows[k]; ok {
		reg.IsActive = true
	} else {
		r.rows[k] = &domain.ContestRegistration{ID: "reg-" + k, ContestID: contestID, StudentID: studentID, IsActive: true}
	}
	r.activated = append(r.activated, k)
	return nil
}

// --- fixture -------------------------------------------------------------

type assessFixture struct {
	engine      *gin.Engine
	attempts    *fakeHTTPAttempts
	submissions *fakeHTTPSubmissions
	roster      *fakeHTTPRoster
	contests    map[string]*domain.Contest
	locked      bool // when true, Start answers 402 for every contest
}

const (
	q1 = "q1"
	q2 = "q2"
)

// nowish is the clock the usecase will read, so contest windows built from it
// line up with the request handling.
var nowish = time.Now().UTC().Truncate(time.Second)

func rfc(t time.Time) string { return t.Format(time.RFC3339) }

func newAssessFixture() *assessFixture {
	return &assessFixture{
		attempts: &fakeHTTPAttempts{rows: map[string]*domain.Attempt{}},
		roster:   &fakeHTTPRoster{rows: map[string]*domain.ContestRegistration{}},
		contests: map[string]*domain.Contest{},
	}
}

// addContest registers a two-question contest with an explicit mode and window.
func (f *assessFixture) addContest(id, mode string, start, end time.Time, duration int) *domain.Contest {
	c := &domain.Contest{
		ID: id, Title: "Contest " + id, Type: "free", Mode: mode,
		StartTime: rfc(start), EndTime: rfc(end), DurationMinutes: duration,
		Questions: []string{q1, q2}, Scope: &domain.Scope{ProgramID: "grade-12", StreamID: "common"},
		LatePenaltyPercent: 10,
	}
	f.contests[id] = c
	return c
}

func (f *assessFixture) serve() *gin.Engine {
	if f.engine != nil {
		return f.engine
	}
	gin.SetMode(gin.TestMode)
	questions := &fakeHTTPQuestions{rows: map[string]*domain.Question{
		q1: {ID: q1, QuestionText: "2+2?", MultipleChoice: []string{"3", "4", "5"}, Answer: 2, Explanation: "counting"},
		q2: {ID: q2, QuestionText: "Capital?", MultipleChoice: []string{"Addis", "Cairo"}, Answer: 1},
	}}
	contests := &fakeHTTPContests{rows: f.contests}
	students := &fakeHTTPStudents{rows: map[string]*domain.Student{"s1": {ID: "s1", Name: "Abebe"}, "s2": {ID: "s2", Name: "Kebede"}}}
	subs := &fakeHTTPSubmissions{}
	f.submissions = subs
	uc := usecase.NewAttemptUsecase(f.attempts, contests, questions, students, subs)
	uc.Roster = f.roster
	uc.Access = func(_ string, c domain.Contest) error {
		if f.locked {
			return &usecase.LockedError{Lock: map[string]any{"reason": "premium", "contest_id": c.ID}}
		}
		return nil
	}
	h := NewAssessmentHandler(uc)
	h.studentAuth = studentAuth([]byte(assessTestSecret))
	r := gin.New()
	h.RegisterRoutes(r.Group("/api"), adminAuth([]byte(assessTestSecret)))
	f.engine = r
	return r
}

func tokenFor(role, userID string) string {
	claims := domain.CustomClaims{UserID: userID, Role: role,
		RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))}}
	s, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(assessTestSecret))
	if err != nil {
		panic(err)
	}
	return s
}

// callRaw issues a request as the given student (empty = anonymous) and returns
// the status, the raw body and the response headers.
func (f *assessFixture) callRaw(t *testing.T, method, path, body, student string) (int, string, http.Header) {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if student != "" {
		req.Header.Set("Authorization", "Bearer "+tokenFor(StudentRole, student))
	}
	w := httptest.NewRecorder()
	f.serve().ServeHTTP(w, req)
	return w.Code, w.Body.String(), w.Header()
}

// call is callRaw with the JSON object decoded.
func (f *assessFixture) call(t *testing.T, method, path, body, student string) (int, map[string]any) {
	t.Helper()
	code, raw, _ := f.callRaw(t, method, path, body, student)
	var out map[string]any
	if strings.HasPrefix(strings.TrimSpace(raw), "{") {
		if err := json.Unmarshal([]byte(raw), &out); err != nil {
			t.Fatalf("%s %s: body is not an object: %q", method, path, raw)
		}
	}
	return code, out
}

// callAdmin issues a request to an /api/admin/* route. adminAuth reads the JWT
// from the "token" cookie (that is what the admin panel sends), so the token
// goes there; pass "" to test the unauthenticated path.
func (f *assessFixture) callAdmin(t *testing.T, method, path, body, adminToken string) (int, string, http.Header) {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if adminToken != "" {
		req.AddCookie(&http.Cookie{Name: "token", Value: adminToken})
	}
	w := httptest.NewRecorder()
	f.serve().ServeHTTP(w, req)
	return w.Code, w.Body.String(), w.Header()
}

// adminList decodes a JSON array body.
func jsonArray(t *testing.T, raw string) []any {
	t.Helper()
	var out []any
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		t.Fatalf("body is not a JSON array: %q", raw)
	}
	return out
}

func jsonObject(t *testing.T, raw string) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		t.Fatalf("body is not a JSON object: %q", raw)
	}
	return out
}

func mustStatus(t *testing.T, code int, want int, body map[string]any) {
	t.Helper()
	if code != want {
		t.Fatalf("status = %d want %d, body = %v", code, want, body)
	}
}

func seedAttempt(f *assessFixture, a domain.Attempt) { f.attempts.rows[a.ID] = &a }

// pathID quotes an attempt id for a URL: ids contain "#", which has to travel
// percent-encoded exactly like the apps' encodeURIComponent calls do.
func pathID(s string) string { return strings.ReplaceAll(s, "#", "%23") }

func codeOf(t *testing.T, body map[string]any) string {
	t.Helper()
	c, _ := body["code"].(string)
	return c
}

// getArray GETs a student route and decodes its JSON array body.
func (f *assessFixture) getArray(t *testing.T, path, student string) ([]any, int) {
	t.Helper()
	code, raw, _ := f.callRaw(t, http.MethodGet, path, "", student)
	return jsonArray(t, raw), code
}

// start begins (or resumes) an assessment and returns the 200 body.
func (f *assessFixture) start(t *testing.T, contestID, student string) map[string]any {
	t.Helper()
	code, body := f.call(t, http.MethodPost, "/api/assessments/"+contestID+"/start", "", student)
	mustStatus(t, code, http.StatusOK, body)
	return body
}

// putAnswers autosaves a draft; returns status + decoded body.
func (f *assessFixture) putAnswers(t *testing.T, attemptID, student, body string) (int, map[string]any) {
	t.Helper()
	return f.call(t, http.MethodPut, "/api/attempts/"+pathID(attemptID)+"/answers", body, student)
}

// --- reads --------------------------------------------------------------

func TestAssessmentListIsMetadataOnlyAndScopeFiltered(t *testing.T) {
	f := newAssessFixture()
	g12 := f.addContest("g12", domain.ContestModeSelfPaced, nowish.Add(-time.Hour), nowish.Add(time.Hour), 60)
	g11 := f.addContest("g11", domain.ContestModeGlobal, nowish.Add(-2*time.Hour), nowish.Add(-time.Hour), 0)
	g11.Scope.ProgramID = "grade-11"
	_ = g12

	code, raw, _ := f.callRaw(t, http.MethodGet, "/api/assessments?program_id=grade-12", "", "s1")
	mustStatus(t, code, http.StatusOK, nil)
	items := jsonArray(t, raw)
	if len(items) != 1 {
		t.Fatalf("scope filter leaked another program: %v", items)
	}
	item := items[0].(map[string]any)
	if item["id"] != "g12" || item["mode"] != "self_paced" || item["kind"] != "contest" ||
		item["access"] != "free" || item["question_count"] != float64(2) {
		t.Fatalf("unexpected list row: %v", item)
	}
	for _, k := range []string{"server_now", "start_time", "end_time", "reveal", "duration_minutes", "late_penalty_percent", "title", "description"} {
		if _, ok := item[k]; !ok {
			t.Fatalf("list row is missing %q: %v", k, item)
		}
	}
	// plan §5.4.2: the list never carries questions, only their count.
	if _, ok := item["questions"]; ok {
		t.Fatalf("list row carries questions: %v", item)
	}
	if _, ok := item["my_attempt"]; ok {
		t.Fatal("my_attempt present before any attempt")
	}
	// The scope struct is echoed for the client's badges.
	scope := item["scope"].(map[string]any)
	if scope["program_id"] != "grade-12" || scope["stream_id"] != "common" {
		t.Fatalf("scope not echoed: %v", scope)
	}

	code, raw, _ = f.callRaw(t, http.MethodGet, "/api/assessments?program_id=grade-11&program_id=grade-12", "", "s1")
	mustStatus(t, code, http.StatusOK, nil)
	if len(jsonArray(t, raw)) != 2 {
		t.Fatalf("multi-program filter: %s", raw)
	}

	// A stream filter still sees "common" content of the same program.
	if code, raw, _ = f.callRaw(t, http.MethodGet, "/api/assessments?program_id=grade-12&stream_id=natural-science", "", "s1"); code != http.StatusOK || len(jsonArray(t, raw)) != 1 {
		t.Fatalf("common stream must match a stream filter: %d %s", code, raw)
	}

	// An unknown assessment is a 404, not a 500.
	code, body := f.call(t, http.MethodGet, "/api/assessments/nope", "", "s1")
	mustStatus(t, code, http.StatusNotFound, body)
	if codeOf(t, body) != "not_found" {
		t.Fatalf("code = %q", codeOf(t, body))
	}
}

func TestIntroCarriesMyAttemptAndLock(t *testing.T) {
	f := newAssessFixture()
	f.addContest("c1", domain.ContestModeSelfPaced, nowish.Add(-time.Hour), nowish.Add(time.Hour), 60)

	intro := func() map[string]any {
		code, body := f.call(t, http.MethodGet, "/api/assessments/c1", "", "s1")
		mustStatus(t, code, http.StatusOK, body)
		return body
	}
	if _, ok := intro()["my_attempt"]; ok {
		t.Fatal("no attempt yet")
	}

	f.start(t, "c1", "s1")
	my := intro()["my_attempt"].(map[string]any)
	if my["id"] != domain.AttemptID("c1", "s1") || my["status"] != domain.AttemptInProgress {
		t.Fatalf("my_attempt = %v", my)
	}
	// Intro.tsx counts the resume down from this; an empty value would render
	// "NaN" on the start button.
	if exp, _ := my["expires_at"].(string); exp == "" {
		t.Fatalf("my_attempt.expires_at missing: %v", my)
	}

	// A premium contest tells the client why it is locked, both in the intro and
	// in the list, without leaking questions.
	f.locked = true
	body := intro()
	lock, ok := body["lock"].(map[string]any)
	if !ok || lock["reason"] != "premium" || lock["contest_id"] != "c1" {
		t.Fatalf("lock object missing from intro: %v", body["lock"])
	}
	code, raw, _ := f.callRaw(t, http.MethodGet, "/api/assessments", "", "s1")
	mustStatus(t, code, http.StatusOK, nil)
	if row := jsonArray(t, raw)[0].(map[string]any); row["lock"] == nil {
		t.Fatalf("lock object missing from the list row: %v", row)
	}
}

func TestStartStatusMap(t *testing.T) {
	f := newAssessFixture()
	f.addContest("self", domain.ContestModeSelfPaced, nowish.Add(-time.Hour), nowish.Add(time.Hour), 60)
	f.addContest("future", domain.ContestModeSelfPaced, nowish.Add(30*time.Minute), nowish.Add(3*time.Hour), 60)
	f.addContest("closed", domain.ContestModeGlobal, nowish.Add(-3*time.Hour), nowish.Add(-30*time.Minute), 0)

	// unknown assessment: the client's typo is not the server's fault (500 was
	// the old behaviour).
	code, body := f.call(t, http.MethodPost, "/api/assessments/nope/start", "", "s1")
	mustStatus(t, code, http.StatusNotFound, body)

	if code, body = f.call(t, http.MethodPost, "/api/assessments/future/start", "", "s1"); code != http.StatusForbidden || codeOf(t, body) != "assessment_not_open" {
		t.Fatalf("future start = %d %v", code, body)
	}
	if code, body = f.call(t, http.MethodPost, "/api/assessments/closed/start", "", "s1"); code != http.StatusForbidden || codeOf(t, body) != "assessment_closed" {
		t.Fatalf("closed global start = %d %v", code, body)
	}
	// self_paced keeps working after its window: it is the late flag, not a
	// refusal, that handles a late start (plan §5.4.1).
	f.addContest("late-window", domain.ContestModeSelfPaced, nowish.Add(-3*time.Hour), nowish.Add(-time.Hour), 30)
	if code, body = f.call(t, http.MethodPost, "/api/assessments/late-window/start", "", "s1"); code != http.StatusOK {
		t.Fatalf("late self_paced start = %d %v", code, body)
	}

	// premium lock: 402 + the uniform lock object, and no attempt row created.
	f.locked = true
	if code, body = f.call(t, http.MethodPost, "/api/assessments/self/start", "", "s2"); code != http.StatusPaymentRequired || codeOf(t, body) != "locked" {
		t.Fatalf("locked start = %d %v", code, body)
	}
	if body["lock"] == nil {
		t.Fatalf("402 without a lock object: %v", body)
	}
	f.locked = false

	// Happy path: deterministic id, server-derived deadline, questions with no
	// answer key (the answer only ever travels in the editorial).
	code, body = f.call(t, http.MethodPost, "/api/assessments/self/start", "", "s1")
	mustStatus(t, code, http.StatusOK, body)
	attempt := body["attempt"].(map[string]any)
	if attempt["id"] != domain.AttemptID("self", "s1") || attempt["status"] != domain.AttemptInProgress {
		t.Fatalf("attempt = %v", attempt)
	}
	if attempt["answers_version"] != float64(0) || attempt["total"] != float64(2) {
		t.Fatalf("attempt = %v", attempt)
	}
	if _, err := time.Parse(time.RFC3339, body["server_now"].(string)); err != nil {
		t.Fatalf("server_now: %v", err)
	}
	exp, err := time.Parse(time.RFC3339, attempt["expires_at"].(string))
	if err != nil {
		t.Fatalf("expires_at: %v", err)
	}
	// self_paced deadline = start + duration, read from the server clock.
	if want := nowish.Add(60 * time.Minute); exp.Sub(want) > time.Minute || want.Sub(exp) > time.Minute {
		t.Fatalf("expires_at = %v want ~%v", exp, want)
	}
	qs := body["questions"].([]any)
	if len(qs) != 2 {
		t.Fatalf("questions = %v", qs)
	}
	for _, item := range qs {
		q := item.(map[string]any)
		for _, leak := range []string{"answer", "explanation", "explanation_image", "scope"} {
			if _, ok := q[leak]; ok {
				t.Fatalf("start leaked %q: %v", leak, q)
			}
		}
		if q["question_text"] == nil || q["multiple_choice"] == nil {
			t.Fatalf("public question lost its stem: %v", q)
		}
	}
	if body["resumed"] != false {
		t.Fatalf("resumed = %v", body["resumed"])
	}

	// A different student gets their own attempt, never s1's.
	code, body = f.call(t, http.MethodPost, "/api/assessments/self/start", "", "s2")
	mustStatus(t, code, http.StatusOK, body)
	if body["attempt"].(map[string]any)["id"] != domain.AttemptID("self", "s2") {
		t.Fatalf("cross-student attempt id: %v", body)
	}

	// Re-entering an in-progress assessment RESUMES it (Intro.tsx's "Resume"
	// button calls start again): 200, resumed, same attempt id.
	code, body = f.call(t, http.MethodPost, "/api/assessments/self/start", "", "s1")
	mustStatus(t, code, http.StatusOK, body)
	if body["resumed"] != true || body["attempt"].(map[string]any)["id"] != domain.AttemptID("self", "s1") {
		t.Fatalf("resume = %v", body)
	}

	// Once it is recorded, start refuses with 409 + the attempt id the client
	// bounces to the result page with (Exam.tsx reads body.attempt_id).
	seedAttempt(f, domain.Attempt{ID: domain.AttemptID("self", "s3"), ContestID: "self", StudentID: "s3",
		Status: domain.AttemptSubmitted, Mode: domain.ContestModeSelfPaced, Total: 2})
	code, body = f.call(t, http.MethodPost, "/api/assessments/self/start", "", "s3")
	mustStatus(t, code, http.StatusConflict, body)
	if codeOf(t, body) != "already_attempted" || body["attempt_id"] != domain.AttemptID("self", "s3") {
		t.Fatalf("already_attempted body = %v", body)
	}

	// An attempt left running past its deadline + the 30s grace is finalised on
	// the spot and then refused, so a closed tab cannot be reopened as a resume.
	seedAttempt(f, domain.Attempt{ID: domain.AttemptID("self", "s4"), ContestID: "self", StudentID: "s4",
		Status: domain.AttemptInProgress, Mode: domain.ContestModeSelfPaced,
		StartedAt: rfc(nowish.Add(-2 * time.Hour)), ExpiresAt: rfc(nowish.Add(-90 * time.Minute)),
		Answers: map[string]int{q1: 2}})
	code, body = f.call(t, http.MethodPost, "/api/assessments/self/start", "", "s4")
	mustStatus(t, code, http.StatusConflict, body)
	if got := f.attempts.rows[domain.AttemptID("self", "s4")]; got.Status != domain.AttemptAutoSubmitted {
		t.Fatalf("expired attempt on start: status = %s body = %v", got.Status, body)
	}
}

func TestAssessmentRoutesRequireStudentSession(t *testing.T) {
	f := newAssessFixture()
	f.addContest("c1", domain.ContestModeSelfPaced, nowish.Add(-time.Hour), nowish.Add(time.Hour), 60)
	aid := domain.AttemptID("c1", "s1")
	routes := []struct{ method, path, body string }{
		{http.MethodGet, "/api/assessments", ""},
		{http.MethodGet, "/api/assessments/c1", ""},
		{http.MethodGet, "/api/assessments/c1/leaderboard", ""},
		{http.MethodPost, "/api/assessments/c1/start", ""},
		{http.MethodPut, "/api/attempts/" + pathID(aid) + "/answers", `{"answers":{"q1":2},"version":0}`},
		{http.MethodPost, "/api/attempts/" + pathID(aid) + "/submit", `{}`},
		{http.MethodGet, "/api/attempts/" + pathID(aid) + "/result", ""},
	}
	// An admin token (no role) must not read a student surface, and a tampered
	// signature must not either: the student id always comes from the JWT.
	tokens := []string{"", tokenFor("", "admin@example.com"), tokenFor(StudentRole, "s1") + "x"}
	for _, r := range routes {
		for _, tok := range tokens {
			req := httptest.NewRequest(r.method, r.path, strings.NewReader(r.body))
			if r.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}
			if tok != "" {
				req.Header.Set("Authorization", "Bearer "+tok)
			}
			w := httptest.NewRecorder()
			f.serve().ServeHTTP(w, req)
			if w.Code != http.StatusUnauthorized {
				t.Fatalf("%s %s token=%q: status = %d want 401, body = %s", r.method, r.path, tok, w.Code, w.Body.String())
			}
		}
	}
	// With a real student session every route above is reachable (2xx/4xx from
	// the usecase, never 401).
	for _, r := range routes {
		code, raw, _ := f.callRaw(t, r.method, r.path, r.body, "s1")
		if code == http.StatusUnauthorized {
			t.Fatalf("%s %s: student session rejected: %s", r.method, r.path, raw)
		}
	}
}

func TestAdminAttemptRoutesRequireAdminCookie(t *testing.T) {
	f := newAssessFixture()
	f.addContest("c1", domain.ContestModeSelfPaced, nowish.Add(-time.Hour), nowish.Add(time.Hour), 60)
	f.start(t, "c1", "s1")
	aid := domain.AttemptID("c1", "s1")
	admin := tokenFor("", "admin@example.com")
	student := tokenFor(StudentRole, "s1")
	routes := []struct{ method, path, body string }{
		{http.MethodGet, "/api/admin/attempt-counts", ""},
		{http.MethodGet, "/api/admin/assessments/c1/attempts", ""},
		{http.MethodGet, "/api/admin/assessments/c1/attempts.csv", ""},
		{http.MethodGet, "/api/admin/attempts/" + pathID(aid), ""},
		{http.MethodPatch, "/api/admin/attempts/" + pathID(aid), `{"action":"waive_penalty"}`},
	}
	for _, r := range routes {
		// anonymous, student session in the cookie, and a student Bearer with no
		// cookie at all: none of them is an admin (S2 cross-role escalation).
		for _, tok := range []string{"", student} {
			code, raw, _ := f.callAdmin(t, r.method, r.path, r.body, tok)
			if code != http.StatusUnauthorized {
				t.Fatalf("%s %s as %q: status = %d want 401, body = %s", r.method, r.path, tok, code, raw)
			}
		}
		req := httptest.NewRequest(r.method, r.path, nil)
		req.Header.Set("Authorization", "Bearer "+student)
		w := httptest.NewRecorder()
		f.serve().ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s with student bearer: status = %d want 401", r.method, r.path, w.Code)
		}
		code, raw, _ := f.callAdmin(t, r.method, r.path, r.body, admin)
		if code != http.StatusOK {
			t.Fatalf("%s %s as admin: status = %d want 200, body = %s", r.method, r.path, code, raw)
		}
	}
}

// --- autosave / submit ---------------------------------------------------

func TestAutosaveStatusMap(t *testing.T) {
	f := newAssessFixture()
	f.addContest("c1", domain.ContestModeSelfPaced, nowish.Add(-time.Hour), nowish.Add(time.Hour), 60)
	f.start(t, "c1", "s1")
	aid := domain.AttemptID("c1", "s1")

	code, body := f.putAnswers(t, aid, "s1", `{"answers":{"q1":2,"q2":1},"flagged":["q2"],"version":0}`)
	mustStatus(t, code, http.StatusOK, body)
	if body["version"] != float64(1) {
		t.Fatalf("version = %v", body["version"])
	}
	if _, err := time.Parse(time.RFC3339, body["server_now"].(string)); err != nil {
		t.Fatalf("server_now: %v", err)
	}
	if row := f.attempts.rows[aid]; row.Answers[q1] != 2 || len(row.Flagged) != 1 {
		t.Fatalf("draft not stored: %+v", row)
	}

	// The version counter is the write guard: a stale tab (another phone) gets
	// 409 and Exam.tsx bumps its counter instead of clobbering the draft.
	if code, body = f.putAnswers(t, aid, "s1", `{"answers":{"q1":1},"version":0}`); code != http.StatusConflict || codeOf(t, body) != "version_conflict" {
		t.Fatalf("stale version = %d %v", code, body)
	}
	if code, body = f.putAnswers(t, aid, "s2", `{"answers":{"q1":1},"version":1}`); code != http.StatusForbidden || codeOf(t, body) != "forbidden" {
		t.Fatalf("other student = %d %v", code, body)
	}
	if code, body = f.putAnswers(t, "no-such-attempt", "s1", `{"answers":{},"version":0}`); code != http.StatusNotFound || codeOf(t, body) != "not_found" {
		t.Fatalf("missing attempt = %d %v", code, body)
	}
	if code, body = f.putAnswers(t, aid, "s1", `{"answers":`); code != http.StatusBadRequest {
		t.Fatalf("malformed body = %d %v", code, body)
	}

	// Past expires_at + the 30s grace the draft is refused (410): the tab is
	// dead, the sweeper owns the attempt now.
	expired := domain.AttemptID("c1", "s5")
	seedAttempt(f, domain.Attempt{ID: expired, ContestID: "c1", StudentID: "s5", Status: domain.AttemptInProgress,
		Mode: domain.ContestModeSelfPaced, StartedAt: rfc(nowish.Add(-2 * time.Hour)), ExpiresAt: rfc(nowish.Add(-90 * time.Minute))})
	if code, body = f.putAnswers(t, expired, "s5", `{"answers":{"q1":2},"version":0}`); code != http.StatusGone || codeOf(t, body) != "attempt_expired" {
		t.Fatalf("expired = %d %v", code, body)
	}

	// A recorded attempt takes no more drafts.
	f.call(t, http.MethodPost, "/api/attempts/"+pathID(aid)+"/submit", `{"answers":{"q1":2,"q2":1}}`, "s1")
	if code, body = f.putAnswers(t, aid, "s1", `{"answers":{"q1":1},"version":1}`); code != http.StatusConflict || codeOf(t, body) != "attempt_finalised" {
		t.Fatalf("after submit = %d %v", code, body)
	}
}

func TestSubmitGradesServerSide(t *testing.T) {
	f := newAssessFixture()
	f.addContest("c1", domain.ContestModeSelfPaced, nowish.Add(-time.Hour), nowish.Add(time.Hour), 60)
	// An on-time start, but the clock runs past the window: the late flag and
	// the penalty come from the server, never from the client.
	f.addContest("late", domain.ContestModeSelfPaced, nowish.Add(-3*time.Hour), nowish.Add(-time.Hour), 30)

	// The last autosave is what gets graded when submit carries no answers.
	f.start(t, "c1", "s1")
	aid := domain.AttemptID("c1", "s1")
	if code, body := f.putAnswers(t, aid, "s1", `{"answers":{"q1":2,"q2":1},"version":0}`); code != http.StatusOK {
		t.Fatalf("autosave = %d %v", code, body)
	}
	code, body := f.call(t, http.MethodPost, "/api/attempts/"+pathID(aid)+"/submit", `{}`, "s1")
	mustStatus(t, code, http.StatusOK, body)
	if body["status"] != domain.AttemptSubmitted || body["correct"] != float64(2) || body["total"] != float64(2) ||
		body["points"] != float64(100) || body["is_late"] != false || body["penalty_percent"] != float64(0) {
		t.Fatalf("submit body = %v", body)
	}
	// The submitted attempt is the result header: the draft answers never come
	// back through this route (only the editorial does, and only when visible).
	if _, ok := body["answers"]; ok {
		t.Fatalf("submit returned draft answers: %v", body)
	}
	if body["submission_id"] != "sub-1" {
		t.Fatalf("submission_id = %v", body["submission_id"])
	}
	if len(f.submissions.rows) != 1 || f.submissions.rows[0].AttemptID != aid || f.submissions.rows[0].Points != 100 {
		t.Fatalf("submission row = %+v", f.submissions.rows)
	}
	// Idempotent: a second tap on submit re-reads the same result, no second row.
	code, body = f.call(t, http.MethodPost, "/api/attempts/"+pathID(aid)+"/submit", `{}`, "s1")
	mustStatus(t, code, http.StatusOK, body)
	if len(f.submissions.rows) != 1 {
		t.Fatalf("double submit wrote a second submission: %+v", f.submissions.rows)
	}

	// Answers in the submit body win over the stored draft (1 of 2 correct).
	f.start(t, "c1", "s2")
	code, body = f.call(t, http.MethodPost, "/api/attempts/"+pathID(domain.AttemptID("c1", "s2"))+"/submit",
		`{"answers":{"q1":2,"q2":2}}`, "s2")
	mustStatus(t, code, http.StatusOK, body)
	if body["correct"] != float64(1) || body["points"] != float64(50) {
		t.Fatalf("final answers ignored: %v", body)
	}

	// Late: penalty 10% of 100 points => 90, and is_late true (decision 13).
	f.start(t, "late", "s3")
	code, body = f.call(t, http.MethodPost, "/api/attempts/"+pathID(domain.AttemptID("late", "s3"))+"/submit",
		`{"answers":{"q1":2,"q2":1}}`, "s3")
	mustStatus(t, code, http.StatusOK, body)
	if body["is_late"] != true || body["penalty_percent"] != float64(10) || body["points"] != float64(90) {
		t.Fatalf("late grading = %v", body)
	}

	// Ownership and existence are enforced on submit too.
	if code, body = f.call(t, http.MethodPost, "/api/attempts/"+pathID(aid)+"/submit", `{}`, "s4"); code != http.StatusForbidden {
		t.Fatalf("other student submit = %d %v", code, body)
	}
	if code, body = f.call(t, http.MethodPost, "/api/attempts/nope/submit", `{}`, "s1"); code != http.StatusNotFound {
		t.Fatalf("missing submit = %d %v", code, body)
	}

	// Abandoned: an expired attempt with no answers at all records no submission
	// and never reaches the leaderboard.
	dead := domain.AttemptID("c1", "s6")
	seedAttempt(f, domain.Attempt{ID: dead, ContestID: "c1", StudentID: "s6", Status: domain.AttemptInProgress,
		Mode: domain.ContestModeSelfPaced, StartedAt: rfc(nowish.Add(-2 * time.Hour)), ExpiresAt: rfc(nowish.Add(-90 * time.Minute)), Total: 2})
	code, body = f.call(t, http.MethodPost, "/api/attempts/"+pathID(dead)+"/submit", `{}`, "s6")
	mustStatus(t, code, http.StatusOK, body)
	if body["status"] != domain.AttemptAbandoned || body["submission_id"] != nil {
		t.Fatalf("abandoned = %v", body)
	}
	// Three recorded attempts (s1, s2, s3) and no row for the abandoned one.
	if len(f.submissions.rows) != 3 {
		t.Fatalf("abandoned attempt wrote a submission: %+v", f.submissions.rows)
	}
}

// --- result / leaderboard ------------------------------------------------

func TestResultAnswerVisibility(t *testing.T) {
	f := newAssessFixture()
	hidden := f.addContest("hidden", domain.ContestModeSelfPaced, nowish.Add(-time.Hour), nowish.Add(time.Hour), 60)
	// a contest-kind assessment reveals at end_time by default; make it explicit.
	hidden.Reveal = domain.RevealAtEnd
	open := f.addContest("open", domain.ContestModeSelfPaced, nowish.Add(-time.Hour), nowish.Add(time.Hour), 60)
	open.Reveal = domain.RevealOnSubmit

	result := func(attemptID, student string) map[string]any {
		code, body := f.call(t, http.MethodGet, "/api/attempts/"+pathID(attemptID)+"/result", "", student)
		mustStatus(t, code, http.StatusOK, body)
		return body
	}

	// In progress: a score header exists but nothing is marked visible.
	f.start(t, "hidden", "s1")
	hid := domain.AttemptID("hidden", "s1")
	body := result(hid, "s1")
	if body["answers_visible"] != false || body["attempt"].(map[string]any)["status"] != domain.AttemptInProgress {
		t.Fatalf("in-progress result = %v", body)
	}
	if _, ok := body["editorial"]; ok {
		t.Fatalf("in-progress result leaked an editorial: %v", body)
	}
	if _, ok := body["attempt"].(map[string]any)["answers"]; ok {
		t.Fatalf("result exposed draft answers: %v", body)
	}

	// Submitted but before the window closes: no editorial, reveal_at tells the
	// client when to look again.
	f.putAnswers(t, hid, "s1", `{"answers":{"q1":2,"q2":1},"version":0}`)
	f.call(t, http.MethodPost, "/api/attempts/"+pathID(hid)+"/submit", `{}`, "s1")
	body = result(hid, "s1")
	if body["answers_visible"] != false || body["editorial"] != nil {
		t.Fatalf("early result = %v", body)
	}
	if body["reveal_at"] != hidden.EndTime {
		t.Fatalf("reveal_at = %v want %v", body["reveal_at"], hidden.EndTime)
	}
	// The score is always there, so the student sees where they stand.
	attempt := body["attempt"].(map[string]any)
	if attempt["points"] != float64(100) || attempt["status"] != domain.AttemptSubmitted {
		t.Fatalf("score missing = %v", attempt)
	}

	// reveal = on_submit: the editorial arrives with the answer key, in the
	// student's own question order, flagged against what they picked.
	f.start(t, "open", "s2")
	openID := domain.AttemptID("open", "s2")
	f.putAnswers(t, openID, "s2", `{"answers":{"q1":1,"q2":1},"version":0}`)
	f.call(t, http.MethodPost, "/api/attempts/"+pathID(openID)+"/submit", `{}`, "s2")
	body = result(openID, "s2")
	if body["answers_visible"] != true {
		t.Fatalf("on_submit result = %v", body)
	}
	ed := body["editorial"].([]any)
	if len(ed) != 2 {
		t.Fatalf("editorial = %v", ed)
	}
	first := ed[0].(map[string]any)
	if first["id"] != q1 || first["answer"] != float64(2) || first["user_answer"] != float64(1) ||
		first["is_correct"] != false || first["explanation"] != "counting" {
		t.Fatalf("editorial row 1 = %v", first)
	}
	if second := ed[1].(map[string]any); second["id"] != q2 || second["is_correct"] != true {
		t.Fatalf("editorial row 2 = %v", second)
	}
	if body["attempt"].(map[string]any)["correct"] != float64(1) {
		t.Fatalf("score after grading = %v", body["attempt"])
	}
	// The draft answers are still stripped from the attempt header: only the
	// editorial carries what the student picked.
	if _, ok := body["attempt"].(map[string]any)["answers"]; ok {
		t.Fatalf("result exposed draft answers: %v", body)
	}

	// Someone else's attempt (and a missing one) is refused.
	if code, body := f.call(t, http.MethodGet, "/api/attempts/"+pathID(hid)+"/result", "", "s3"); code != http.StatusForbidden {
		t.Fatalf("other student result = %d %v", code, body)
	}
	if code, body := f.call(t, http.MethodGet, "/api/attempts/nope/result", "", "s1"); code != http.StatusNotFound {
		t.Fatalf("missing result = %d %v", code, body)
	}
}

func TestLeaderboardRanksPointsThenDuration(t *testing.T) {
	f := newAssessFixture()
	f.addContest("lb", domain.ContestModeGlobal, nowish.Add(-2*time.Hour), nowish.Add(time.Hour), 0)
	seed := func(student string, points, seconds int, mutate func(*domain.Attempt)) {
		a := domain.Attempt{ID: domain.AttemptID("lb", student), ContestID: "lb", StudentID: student,
			Status: domain.AttemptSubmitted, Mode: domain.ContestModeGlobal,
			Correct: points / 50, Total: 2, Points: points, DurationSeconds: seconds,
			StartedAt: rfc(nowish.Add(-time.Hour)), ExpiresAt: rfc(nowish.Add(time.Hour)), SubmittedAt: rfc(nowish)}
		if mutate != nil {
			mutate(&a)
		}
		seedAttempt(f, a)
	}
	seed("s2", 100, 40, nil) // fastest of the 100-point pair => rank 1
	seed("s1", 100, 300, nil)
	seed("s3", 50, 100, nil)
	seed("s4", 100, 1, func(a *domain.Attempt) { a.Excluded = true }) // cheater: off the board
	seed("s5", 100, 1, func(a *domain.Attempt) { a.Status = domain.AttemptAbandoned })
	seed("s6", 100, 1, func(a *domain.Attempt) { a.Status = domain.AttemptInProgress })

	rows, code := f.getArray(t, "/api/assessments/lb/leaderboard", "s1")
	mustStatus(t, code, http.StatusOK, nil)
	if len(rows) != 3 {
		t.Fatalf("excluded/abandoned/in_progress leaked onto the board: %v", rows)
	}
	want := []struct {
		student string
		rank    float64
	}{
		{"s2", 1}, {"s1", 2}, {"s3", 3}, // tie on points breaks on who was faster
	}
	for i, w := range want {
		r := rows[i].(map[string]any)
		if r["student_id"] != w.student || r["rank"] != w.rank {
			t.Fatalf("row %d = %v want %s rank %v", i, r, w.student, w.rank)
		}
	}
	top := rows[0].(map[string]any)
	if top["name"] != "Kebede" || top["points"] != float64(100) || top["correct"] != float64(2) ||
		top["total"] != float64(2) || top["duration_seconds"] != float64(40) || top["is_late"] != false {
		t.Fatalf("top row = %v", top)
	}
	if img, ok := top["imgurl"]; !ok || img == nil {
		t.Fatalf("row lost its avatar field: %v", top)
	}
	// A late self-paced finish is marked, never hidden.
	seed("s7", 90, 10, func(a *domain.Attempt) { a.IsLate = true; a.PenaltyPercent = 10 })
	rows2, _ := f.getArray(t, "/api/assessments/lb/leaderboard", "s1")
	var late map[string]any
	for _, item := range rows2 {
		if r := item.(map[string]any); r["student_id"] == "s7" {
			late = r
		}
	}
	if late == nil || late["is_late"] != true || late["rank"] != float64(3) {
		t.Fatalf("late row = %v", late)
	}
	// An assessment nobody finished has an empty board, not a 404.
	empty, code := f.getArray(t, "/api/assessments/unknown/leaderboard", "s1")
	mustStatus(t, code, http.StatusOK, nil)
	if len(empty) != 0 {
		t.Fatalf("empty board = %v", empty)
	}
}

// --- admin ---------------------------------------------------------------

func TestAdminAttemptRoutesAndActions(t *testing.T) {
	f := newAssessFixture()
	admin := tokenFor("", "admin@example.com")
	f.addContest("c1", domain.ContestModeSelfPaced, nowish.Add(-time.Hour), nowish.Add(time.Hour), 60)
	// an on-time start whose clock runs past the window: submitted late, 1 of 2,
	// 10% penalty => 45 points.
	f.addContest("late", domain.ContestModeSelfPaced, nowish.Add(-3*time.Hour), nowish.Add(-time.Hour), 30)

	aid1 := domain.AttemptID("c1", "s1")
	f.start(t, "c1", "s1")
	f.putAnswers(t, aid1, "s1", `{"answers":{"q1":2,"q2":1},"version":0}`)
	f.call(t, http.MethodPost, "/api/attempts/"+pathID(aid1)+"/submit", `{}`, "s1")
	aid2 := domain.AttemptID("c1", "s2")
	f.start(t, "c1", "s2") // starts, walks away: stays in_progress
	aid3 := domain.AttemptID("late", "s3")
	f.start(t, "late", "s3")
	f.putAnswers(t, aid3, "s3", `{"answers":{"q1":1,"q2":1},"version":0}`)
	f.call(t, http.MethodPost, "/api/attempts/"+pathID(aid3)+"/submit", `{}`, "s3")
	if body := f.attempts.rows[aid3]; body.Points != 45 || !body.IsLate {
		t.Fatalf("late grading setup: points = %d late = %v", body.Points, body.IsLate)
	}

	// counts: one entry per contest, attempts (not submissions) counted.
	code, raw, _ := f.callAdmin(t, http.MethodGet, "/api/admin/attempt-counts", "", admin)
	mustStatus(t, code, http.StatusOK, nil)
	counts := jsonObject(t, raw)
	if counts["c1"] != float64(2) || counts["late"] != float64(1) {
		t.Fatalf("attempt-counts = %v", counts)
	}

	listAttempts := func(path string) []any {
		t.Helper()
		c, r, _ := f.callAdmin(t, http.MethodGet, path, "", admin)
		mustStatus(t, c, http.StatusOK, nil)
		return jsonArray(t, r)
	}
	if got := listAttempts("/api/admin/assessments/c1/attempts"); len(got) != 2 {
		t.Fatalf("admin list = %v", got)
	} else {
		// The admin sees every attempt of the assessment, drafts included.
		ids := map[string]bool{got[0].(map[string]any)["id"].(string): true, got[1].(map[string]any)["id"].(string): true}
		if !ids[aid1] || !ids[aid2] {
			t.Fatalf("admin list ids = %v want %v + %v", ids, aid1, aid2)
		}
	}
	if got := listAttempts("/api/admin/assessments/c1/attempts?label=on_time"); len(got) != 1 ||
		got[0].(map[string]any)["student_id"] != "s1" {
		t.Fatalf("label=on_time = %v", got)
	}
	if got := listAttempts("/api/admin/assessments/c1/attempts?label=in_progress"); len(got) != 1 ||
		got[0].(map[string]any)["student_id"] != "s2" {
		t.Fatalf("label=in_progress = %v", got)
	}
	// A filter with no match is an empty array: the admin table maps over it.
	c, raw, _ := f.callAdmin(t, http.MethodGet, "/api/admin/assessments/c1/attempts?label=late", "", admin)
	mustStatus(t, c, http.StatusOK, nil)
	if strings.TrimSpace(raw) != "[]" {
		t.Fatalf("no-match filter body = %q want []", raw)
	}

	// CSV: download headers, a fixed column set, one row per attempt.
	c, raw, hdr := f.callAdmin(t, http.MethodGet, "/api/admin/assessments/late/attempts.csv", "", admin)
	mustStatus(t, c, http.StatusOK, nil)
	if ct := hdr.Get("Content-Type"); !strings.HasPrefix(ct, "text/csv") {
		t.Fatalf("csv content-type = %q", ct)
	}
	if cd := hdr.Get("Content-Disposition"); cd != `attachment; filename="attempts-late.csv"` {
		t.Fatalf("csv disposition = %q", cd)
	}
	lines := strings.Split(strings.TrimRight(raw, "\r\n"), "\n")
	if len(lines) != 2 {
		t.Fatalf("csv rows = %q", raw)
	}
	if !strings.HasPrefix(lines[0], "attempt_id,student_id,label,status,") ||
		!strings.HasSuffix(lines[0], ",excluded,excluded_reason") {
		t.Fatalf("csv header = %q", lines[0])
	}
	if !strings.Contains(lines[1], aid3) || !strings.Contains(lines[1], ",late,submitted,") ||
		!strings.Contains(lines[1], ",45,") {
		t.Fatalf("csv row = %q", lines[1])
	}

	// An assessment id can never smuggle quotes or newlines into a header.
	weirdID := "we!rd-id"
	seedAttempt(f, domain.Attempt{ID: domain.AttemptID(weirdID, "s1"), ContestID: weirdID, StudentID: "s1",
		Status: domain.AttemptSubmitted, Mode: domain.ContestModeSelfPaced, Points: 10})
	c, _, hdr = f.callAdmin(t, http.MethodGet, "/api/admin/assessments/"+weirdID+"/attempts.csv", "", admin)
	mustStatus(t, c, http.StatusOK, nil)
	if cd := hdr.Get("Content-Disposition"); cd != `attachment; filename="attempts-we_rd-id.csv"` {
		t.Fatalf("csv filename not sanitised: %q", cd)
	}

	// AdminGet.
	c, raw, _ = f.callAdmin(t, http.MethodGet, "/api/admin/attempts/"+pathID(aid1), "", admin)
	mustStatus(t, c, http.StatusOK, nil)
	if jsonObject(t, raw)["id"] != aid1 {
		t.Fatalf("admin get = %s", raw)
	}
	if c, raw, _ = f.callAdmin(t, http.MethodGet, "/api/admin/attempts/nope", "", admin); c != http.StatusNotFound {
		t.Fatalf("admin get missing = %d %s", c, raw)
	}

	patch := func(attemptID, body string) (int, map[string]any) {
		t.Helper()
		c, raw, _ := f.callAdmin(t, http.MethodPatch, "/api/admin/attempts/"+pathID(attemptID), body, admin)
		return c, jsonObject(t, raw)
	}
	// A bad verb or a missing reason is the admin's typo: 400, never 500.
	if c, body := patch(aid1, `{"action":"nuke"}`); c != http.StatusBadRequest || codeOf(t, body) != "invalid_action" {
		t.Fatalf("unknown action = %d %v", c, body)
	}
	if c, body := patch(aid1, `{"action":"exclude"}`); c != http.StatusBadRequest {
		t.Fatalf("exclude without reason = %d %v", c, body)
	}
	if c, body := patch(aid1, `{"action":"reset"}`); c != http.StatusBadRequest {
		t.Fatalf("reset without reason = %d %v", c, body)
	}
	if c, raw, _ := f.callAdmin(t, http.MethodPatch, "/api/admin/attempts/"+pathID(aid1), `{"action":`, admin); c != http.StatusBadRequest {
		t.Fatalf("malformed patch body = %d %s", c, raw)
	}
	if c, raw, _ := f.callAdmin(t, http.MethodPatch, "/api/admin/attempts/nope", `{"action":"regrade"}`, admin); c != http.StatusNotFound {
		t.Fatalf("patch missing attempt = %d %s", c, raw)
	}

	// exclude: needs and keeps an audit reason, and drops the row off the board.
	c, body := patch(aid1, `{"action":"exclude","reason":"proctoring, confirmed"}`)
	mustStatus(t, c, http.StatusOK, body)
	if body["excluded"] != true || body["excluded_reason"] != "proctoring, confirmed" {
		t.Fatalf("exclude = %v", body)
	}
	if got := listAttempts("/api/admin/assessments/c1/attempts?label=excluded"); len(got) != 1 {
		t.Fatalf("excluded label = %v", got)
	}
	c, raw, _ = f.callAdmin(t, http.MethodGet, "/api/admin/assessments/c1/attempts.csv", "", admin)
	mustStatus(t, c, http.StatusOK, nil)
	if !strings.Contains(raw, `"proctoring, confirmed"`) {
		t.Fatalf("csv must quote a comma in the reason: %s", raw)
	}
	// An excluded attempt is off the leaderboard for everyone.
	board, _ := f.getArray(t, "/api/assessments/c1/leaderboard", "s2")
	if len(board) != 0 {
		t.Fatalf("excluded attempt still ranked: %v", board)
	}

	// waive_penalty re-grades with the penalty gone: 45 => 50.
	c, body = patch(aid3, `{"action":"waive_penalty"}`)
	mustStatus(t, c, http.StatusOK, body)
	if body["penalty_waived"] != true || body["penalty_percent"] != float64(0) || body["points"] != float64(50) {
		t.Fatalf("waive_penalty = %v", body)
	}
	// regrade re-reads the stored answers (same result here, and it must not
	// resurrect an excluded row or lose the waiver).
	c, body = patch(aid3, `{"action":"regrade"}`)
	mustStatus(t, c, http.StatusOK, body)
	if body["points"] != float64(50) || body["correct"] != float64(1) {
		t.Fatalf("regrade = %v", body)
	}

	// reset: the attempt row goes and its submission row is unlinked with it.
	before := len(f.submissions.rows)
	c, body = patch(aid3, `{"action":"reset","reason":"server died mid-exam"}`)
	mustStatus(t, c, http.StatusOK, body)
	if _, ok := f.attempts.rows[aid3]; ok {
		t.Fatal("reset left the attempt row")
	}
	if len(f.submissions.rows) != before-1 {
		t.Fatalf("reset left the submission row: %+v", f.submissions.rows)
	}
	if c, raw, _ := f.callAdmin(t, http.MethodGet, "/api/admin/attempts/"+pathID(aid3), "", admin); c != http.StatusNotFound {
		t.Fatalf("get after reset = %d %s", c, raw)
	}
	// ... and the student may start that assessment again.
	f.start(t, "late", "s3")
}

func TestRegisterRouteKeepsTheRoster(t *testing.T) {
	f := newAssessFixture()
	f.addContest("a1", domain.ContestModeGlobal, nowish.Add(-time.Hour), nowish.Add(time.Hour), 0)

	// The route belongs to a signed-in student.
	code, body := f.call(t, http.MethodPost, "/api/assessments/a1/register", "", "")
	mustStatus(t, code, http.StatusUnauthorized, body)

	code, intro := f.call(t, http.MethodGet, "/api/assessments/a1", "", "s1")
	mustStatus(t, code, http.StatusOK, intro)
	if intro["registered"] == true {
		t.Fatal("registered must be absent/false before the student signs up")
	}

	// Signing up twice is not an error and does not double-book.
	for i := 0; i < 2; i++ {
		code, body = f.call(t, http.MethodPost, "/api/assessments/a1/register", "", "s1")
		mustStatus(t, code, http.StatusOK, body)
	}
	if n := len(f.roster.rows); n != 1 {
		t.Fatalf("roster rows = %d, want 1", n)
	}
	code, intro = f.call(t, http.MethodGet, "/api/assessments/a1", "", "s1")
	mustStatus(t, code, http.StatusOK, intro)
	if intro["registered"] != true {
		t.Fatalf("intro after register: %v", intro["registered"])
	}

	// Starting an attempt writes the roster row the legacy exam page wrote on
	// entry, so a student who skipped the registration page is still counted.
	f.start(t, "a1", "s2")
	reg, ok := f.roster.rows[regKeyOf("a1", "s2")]
	if !ok || !reg.IsActive {
		t.Fatalf("roster row after start = %+v (present=%v), want active", reg, ok)
	}

	// A roster outage must never keep a student out of an exam.
	broken := newAssessFixture()
	broken.addContest("a1", domain.ContestModeGlobal, nowish.Add(-time.Hour), nowish.Add(time.Hour), 0)
	broken.roster.err = errors.New("dynamo down")
	code, body = broken.call(t, http.MethodPost, "/api/assessments/a1/start", "", "s1")
	mustStatus(t, code, http.StatusOK, body)
}

func TestEditorialRouteUnlocksOnlyWhenThePaperIsSafeToPublish(t *testing.T) {
	f := newAssessFixture()
	closed := nowish.Add(-2 * time.Hour)
	f.addContest("closed", domain.ContestModeGlobal, nowish.Add(-4*time.Hour), closed, 0)
	f.addContest("live", domain.ContestModeGlobal, nowish.Add(-time.Hour), nowish.Add(time.Hour), 0)
	f.addContest("late", domain.ContestModeSelfPaced, nowish.Add(-4*time.Hour), closed, 30)

	// While a window is open, no answers go out — the legacy page guarded this
	// too, so an early finisher cannot farm the remaining questions.
	code, body := f.call(t, http.MethodGet, "/api/assessments/live/editorial", "", "s1")
	mustStatus(t, code, http.StatusOK, body)
	if body["visible"] == true || body["editorial"] != nil {
		t.Fatalf("live window must publish nothing: %v", body)
	}
	if msg, _ := body["message"].(string); msg == "" {
		t.Fatal("a locked editorial must say why")
	}

	// An ended window is public reading, including for students who never took it.
	code, body = f.call(t, http.MethodGet, "/api/assessments/closed/editorial", "", "s1")
	mustStatus(t, code, http.StatusOK, body)
	items, ok := body["editorial"].([]any)
	if body["visible"] != true || !ok || len(items) != 2 {
		t.Fatalf("ended window for a non-participant: %v", body)
	}
	first := items[0].(map[string]any)
	if answer, ok := first["answer"]; !ok || answer == nil {
		t.Fatalf("editorial item must carry the answer: %v", first)
	}

	// A self-paced paper stays answerable after its end time (late attempts take
	// the penalty), so its answers never go public.
	code, body = f.call(t, http.MethodGet, "/api/assessments/late/editorial", "", "s1")
	mustStatus(t, code, http.StatusOK, body)
	if body["visible"] == true || body["editorial"] != nil {
		t.Fatalf("self-paced non-participant must not read answers: %v", body)
	}

	// A typo'd assessment id is a 404, not a 500.
	code, body = f.call(t, http.MethodGet, "/api/assessments/nope/editorial", "", "s1")
	mustStatus(t, code, http.StatusNotFound, body)
}

func TestPracticeItemsSkipTheRoster(t *testing.T) {
	f := newAssessFixture()
	drill := f.addContest("drill", domain.ContestModeSelfPaced, nowish.Add(-time.Hour), nowish.Add(time.Hour), 20)
	drill.Kind = domain.ContestKindPractice

	// Register is a no-op for study material, so the admin registration stats
	// keep counting contests rather than every practice tap.
	code, body := f.call(t, http.MethodPost, "/api/assessments/drill/register", "", "s1")
	mustStatus(t, code, http.StatusOK, body)
	if len(f.roster.rows) != 0 {
		t.Fatalf("roster rows after registering for a practice item = %d, want 0", len(f.roster.rows))
	}

	// Starting one writes no roster row either, and the intro never asks.
	f.start(t, "drill", "s1")
	if len(f.roster.rows) != 0 {
		t.Fatalf("roster rows after starting a practice item = %d, want 0", len(f.roster.rows))
	}
	code, intro := f.call(t, http.MethodGet, "/api/assessments/drill", "", "s2")
	mustStatus(t, code, http.StatusOK, intro)
	if intro["needs_registration"] == true {
		t.Fatal("a practice item must not ask students to register")
	}
}
