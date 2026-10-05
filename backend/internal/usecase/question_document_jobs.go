package usecase

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"
)

// Parse jobs turn the bulk-question AI parse into a background operation.
// Edge proxies (Cloudflare/Koyeb) cut idle HTTP requests at ~30s, but an
// exam-sized AI parse legitimately runs 30-90s, so the request returns a job
// id immediately and the client polls for the result. Jobs live in memory:
// deployments are single-instance, and a job that dies with its instance is
// simply retried.

const (
	ParseJobProcessing = "processing"
	ParseJobDone       = "done"
	ParseJobError      = "error"

	parseJobRetention    = 30 * time.Minute
	parseJobMaxRetained  = 50
	parseJobMaxRunning   = 3
	parseJobAIBudgetLeft = "ai-call-timeout"
)

// ParseJobStatus is what a client sees when polling a job. Questions and
// Images are populated only when Status is done.
type ParseJobStatus struct {
	Status    string             `json:"status"`
	Questions []aiParsedQuestion `json:"questions,omitempty"`
	Images    []DocumentImage    `json:"images,omitempty"`
	Error     string             `json:"error,omitempty"`
}

type parseJob struct {
	id        string
	status    string
	questions []aiParsedQuestion
	images    []DocumentImage
	errMsg    string
	createdAt time.Time
}

// ParseJobManager owns the in-memory job registry and the running workers.
type ParseJobManager struct {
	mu      sync.Mutex
	jobs    map[string]*parseJob
	running int
	now     func() time.Time
}

func NewParseJobManager() *ParseJobManager {
	return &ParseJobManager{jobs: map[string]*parseJob{}, now: time.Now}
}

// StartAsync registers a prepared parse job and runs it in the background.
// The document must already be extracted (pages/images) so the HTTP handler
// could reject unreadable files synchronously with a 400. It returns the job
// id, or an error when too many jobs are already running.
func (m *ParseJobManager) StartAsync(mode string, filename string, pages []string, images []DocumentImage, ai AiUsecase) (string, error) {
	m.mu.Lock()
	m.pruneLocked()
	if m.running >= parseJobMaxRunning {
		m.mu.Unlock()
		return "", fmt.Errorf("too many parses are already running (%d) — try again in a moment", parseJobMaxRunning)
	}
	id, err := newJobID()
	if err != nil {
		m.mu.Unlock()
		return "", fmt.Errorf("generate job id: %w", err)
	}
	m.jobs[id] = &parseJob{id: id, status: ParseJobProcessing, images: images, createdAt: m.now()}
	m.running++
	m.mu.Unlock()

	go m.run(id, mode, filename, pages, images, ai)
	return id, nil
}

// run executes the job, converting every failure mode (including panics)
// into an error-status job the poller can surface.
func (m *ParseJobManager) run(id, mode, filename string, pages []string, images []DocumentImage, ai AiUsecase) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("parse job %s panicked: %v", id, r)
			m.finish(id, nil, nil, fmt.Errorf("document parser crashed — please retry"))
		}
		m.mu.Lock()
		m.running--
		m.mu.Unlock()
	}()

	var (
		questions []aiParsedQuestion
		err       error
	)
	switch mode {
	case "text":
		qs, perr := ParseQuestionsDocument(filename, []byte(strings.Join(pages, "\n")))
		questions = make([]aiParsedQuestion, 0, len(qs))
		for _, q := range qs {
			questions = append(questions, aiParsedQuestion{Question: q})
		}
		err = perr
	default:
		if ai == nil {
			err = fmt.Errorf("AI parsing is not configured on this deployment — no AI provider is available. Retry with mode=text")
		} else {
			questions, err = ParseQuestionsWithAI(pages, images, ai.CompleteDocumentParse)
		}
	}

	if err != nil {
		log.Printf("parse job %s failed: %v", id, err)
		m.finish(id, nil, nil, err)
		return
	}
	m.finish(id, questions, images, nil)
}

// finish records the outcome of a job (no-op for unknown/expired ids).
func (m *ParseJobManager) finish(id string, questions []aiParsedQuestion, images []DocumentImage, err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	job, ok := m.jobs[id]
	if !ok {
		return
	}
	if err != nil {
		job.status = ParseJobError
		job.errMsg = err.Error()
		return
	}
	job.status = ParseJobDone
	job.questions = questions
	job.images = images
}

// Get returns the current status of a job; ok=false for unknown or expired
// ids (e.g. after a server restart mid-job).
func (m *ParseJobManager) Get(id string) (ParseJobStatus, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	job, ok := m.jobs[id]
	if !ok {
		return ParseJobStatus{}, false
	}
	status := ParseJobStatus{Status: job.status, Error: job.errMsg}
	if job.status == ParseJobDone {
		status.Questions = job.questions
		status.Images = job.images
	}
	return status, true
}

// pruneLocked drops expired and over-cap jobs. Caller holds mu.
func (m *ParseJobManager) pruneLocked() {
	cutoff := m.now().Add(-parseJobRetention)
	for id, job := range m.jobs {
		// A running job is never pruned by age (its worker still writes to
		// it); the running counter bounds those instead.
		if job.status != ParseJobProcessing && job.createdAt.Before(cutoff) {
			delete(m.jobs, id)
		}
	}
	// Hard cap on retained finished jobs, oldest first.
	if len(m.jobs) <= parseJobMaxRetained {
		return
	}
	var finished []string
	for id, job := range m.jobs {
		if job.status != ParseJobProcessing {
			finished = append(finished, id)
		}
	}
	for i := 0; i < len(finished) && len(m.jobs) > parseJobMaxRetained; i++ {
		oldest := finished[0]
		for _, id := range finished {
			if m.jobs[id].createdAt.Before(m.jobs[oldest].createdAt) {
				oldest = id
			}
		}
		delete(m.jobs, oldest)
		finished = finished[1:]
	}
}

func newJobID() (string, error) {
	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}
