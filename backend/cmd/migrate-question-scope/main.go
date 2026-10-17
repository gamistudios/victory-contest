// Command migrate-question-scope maps legacy free-text question grade/subject/chapter to catalog
// ids and stamps Question.Scope (plan 10.2, question bank). Dry run by default; NOT run on boot.
// Questions that already have a scope, or whose grade/subject cannot be matched, are left alone.
//
//	go run ./cmd/migrate-question-scope            # dry run + report
//	go run ./cmd/migrate-question-scope -apply     # write (JSON backup first)
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"victory-contest-go/internal/awsconfig"
	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/repository"
	"victory-contest-go/internal/usecase"

	"github.com/joho/godotenv"
)

var gradeDigits = regexp.MustCompile(`\b(9|10|11|12)\b`)

func programFromGrade(g string) (string, bool) {
	g = strings.TrimSpace(g)
	if domain.IsValidGrade(g) {
		return "grade-" + g, true
	}
	if m := gradeDigits.FindString(g); m != "" {
		return "grade-" + m, true
	}
	return "", false
}

func norm(s string) string { return strings.ToLower(strings.TrimSpace(s)) }

type change struct {
	ID    string       `json:"id"`
	Grade string       `json:"grade"`
	Scope domain.Scope `json:"scope"`
}

func main() {
	apply := flag.Bool("apply", false, "write the changes; without it the tool only reports")
	table := flag.String("table", "question", "question table name")
	backupDir := flag.String("backup-dir", "migration-backups", "backup directory")
	flag.Parse()
	if _, err := os.Stat(".env"); err == nil {
		_ = godotenv.Load()
	}
	ctx := context.Background()
	cfg, err := awsconfig.Load(ctx)
	if err != nil {
		log.Fatalf("load aws config: %v", err)
	}
	ddb := awsconfig.DynamoClient(cfg)
	academy := usecase.NewAcademyUsecase(repository.NewAcademyDynamoRepository(ddb, "academy_content", "academy_students"), nil, nil)
	cat, err := academy.Catalog()
	if err != nil {
		log.Fatalf("load catalog: %v", err)
	}
	questions, err := repository.NewQuestionDynamoRepository(ddb, *table).GetAllQuestions()
	if err != nil {
		log.Fatalf("scan questions: %v", err)
	}
	var changes []change
	already, unmapped := 0, 0
	for _, q := range questions {
		if q.Scope != nil {
			already++
			continue
		}
		prog, ok := programFromGrade(q.Grade)
		if !ok {
			unmapped++
			fmt.Printf("UNMAPPED question=%s grade=%q (left untouched)\n", q.ID, q.Grade)
			continue
		}
		sc := domain.Scope{ProgramID: prog, StreamID: domain.StreamCommon}
		for _, s := range cat.Subjects {
			if (norm(s.Name) == norm(q.Subject) || norm(s.Code) == norm(q.Subject)) && norm(q.Subject) != "" &&
				(s.LevelID == "" || s.LevelID == prog) {
				sc.SubjectID = s.ID
				if s.StreamID != "" {
					sc.StreamID = s.StreamID
				}
				for _, ch := range cat.Chapters {
					if ch.SubjectID == s.ID && norm(ch.Title) == norm(q.Chapter) && norm(q.Chapter) != "" {
						sc.ChapterID = ch.ID
					}
				}
				break
			}
		}
		changes = append(changes, change{ID: q.ID, Grade: q.Grade, Scope: sc})
	}
	fmt.Printf("questions=%d already-scoped=%d to-change=%d unmapped=%d\n", len(questions), already, len(changes), unmapped)
	if !*apply {
		for _, c := range changes {
			fmt.Printf("WOULD SET question=%s grade=%q -> %+v\n", c.ID, c.Grade, c.Scope)
		}
		return
	}
	if len(changes) == 0 {
		return
	}
	if err := os.MkdirAll(*backupDir, 0o755); err != nil {
		log.Fatal(err)
	}
	path := filepath.Join(*backupDir, fmt.Sprintf("migrate-question-scope-%s.json", time.Now().UTC().Format("20060102T150405Z")))
	b, _ := json.MarshalIndent(changes, "", "  ")
	if err := os.WriteFile(path, b, 0o644); err != nil {
		log.Fatalf("backup: %v", err)
	}
	fmt.Printf("backup of %d rows (previous state = no scope): %s\n", len(changes), path)
	qu := usecase.NewQuestionUsecase(repository.NewQuestionDynamoRepository(ddb, *table))
	done, failed := 0, 0
	for _, c := range changes {
		sc := c.Scope
		if err := qu.UpdateQuestion(c.ID, domain.QuestionPatch{Scope: &sc}); err != nil {
			failed++
			fmt.Printf("update %s failed: %v\n", c.ID, err)
			continue
		}
		done++
	}
	fmt.Printf("changed=%d failed=%d\n", done, failed)
	if failed > 0 {
		os.Exit(1)
	}
}
