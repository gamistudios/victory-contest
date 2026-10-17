// Command backfill-leaderboard rebuilds the precomputed leaderboard rows (plan 10.5).
//
// Two sources, both dry-run by default and NOT run on boot:
//
//	go run ./cmd/backfill-leaderboard               # replay the attempts table
//	go run ./cmd/backfill-leaderboard -submissions   # replay the legacy submissions table
//	go run ./cmd/backfill-leaderboard -apply         # actually write the boards
//
// The attempts replay recomputes each student's boards from their finalised Phase 2
// attempts. The submissions replay restores the old contest rounds that were stored
// only as submissions: points come from the score, the answer count from the missed
// list, and the time from the stored duration, so boards for deleted or pre-scope
// contests still get filled in.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"

	"victory-contest-go/internal/awsconfig"
	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/repository"
	"victory-contest-go/internal/usecase"

	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/joho/godotenv"
)

func main() {
	apply := flag.Bool("apply", false, "write the boards; without it the tool only reports")
	fromSubmissions := flag.Bool("submissions", false, "replay the legacy submissions table instead of the attempts table")
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

	leader := usecase.NewLeaderboardUsecase(
		repository.NewLeaderboardDynamoRepository(ddb, "leaderboard"),
		repository.NewAttemptDynamoRepository(ddb, "attempts"),
		repository.NewStudentDynamoRepository(ddb, "student"),
	)
	if *fromSubmissions {
		rep, err := replaySubmissions(ddb, leader, *apply)
		if err != nil {
			log.Fatalf("submissions replay: %v", err)
		}
		fmt.Println(rep.String())
		return
	}

	// One latest attempt per student is enough: Record recomputes from all of that student's attempts.
	latest := map[string]domain.Attempt{}
	total := 0
	pager := dynamodb.NewScanPaginator(ddb, &dynamodb.ScanInput{TableName: strPtr("attempts")})
	for pager.HasMorePages() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			log.Fatalf("scan attempts: %v", err)
		}
		var items []domain.Attempt
		if err := attributevalue.UnmarshalListOfMaps(page.Items, &items); err != nil {
			log.Fatalf("decode attempts: %v", err)
		}
		for _, a := range items {
			total++
			if !a.Finalised() || a.Scope == nil {
				continue
			}
			if cur, ok := latest[a.StudentID]; !ok || a.SubmittedAt > cur.SubmittedAt {
				latest[a.StudentID] = a
			}
		}
	}
	fmt.Printf("attempts=%d students-with-finalised-scoped-attempts=%d apply=%v\n", total, len(latest), *apply)
	if !*apply {
		return
	}
	for _, a := range latest {
		leader.Record(a)
	}
	fmt.Println("done")
}

// replaySubmissions restores the old contest rounds from the submissions table.
func replaySubmissions(ddb *dynamodb.Client, leader *usecase.LeaderboardUsecase, apply bool) (usecase.ReplayReport, error) {
	subs, err := repository.NewSubmissionDynamoRepository(ddb, "submissions").GetAllSubmissions()
	if err != nil {
		return usecase.ReplayReport{}, fmt.Errorf("scan submissions: %w", err)
	}
	contests, err := repository.NewContestDynamoRepository(ddb, "contests").GetAllContests()
	if err != nil {
		return usecase.ReplayReport{}, fmt.Errorf("load contests: %w", err)
	}
	students, err := repository.NewStudentDynamoRepository(ddb, "student").GetStructuredStudents()
	if err != nil {
		return usecase.ReplayReport{}, fmt.Errorf("load students: %w", err)
	}
	byID := map[string]*domain.Contest{}
	for i := range contests {
		byID[contests[i].ID] = &contests[i]
	}

	rows := make([]usecase.LegacyBoardRow, 0, len(subs))
	for i := range subs {
		s := subs[i]
		st, ok := students[s.StudentID]
		var stPtr *domain.Student
		if ok {
			stPtr = &st
		}
		program, stream := resolveProgramStream(byID[s.ContestID], stPtr)
		if program == "" {
			continue // no program resolvable: the round can't be placed on any board
		}
		rows = append(rows, legacyRow(s, program, stream, stPtr))
	}
	return leader.ReplayLegacy(rows, apply)
}

// resolveProgramStream finds which program/stream board a submission belongs to:
// the contest's stamped scope when it exists, otherwise the student's own program
// and stream (used when the contest row has been deleted).
func resolveProgramStream(c *domain.Contest, st *domain.Student) (string, string) {
	if c != nil && c.Scope != nil && c.Scope.ProgramID != "" {
		return c.Scope.ProgramID, c.Scope.StreamID
	}
	if st == nil {
		return "", ""
	}
	program := st.PrimaryProgramID
	for _, e := range st.Enrollments {
		if e.ProgramID == program {
			return program, e.StreamID
		}
	}
	for _, e := range st.Enrollments { // no primary: take their first enrollment
		return e.ProgramID, e.StreamID
	}
	return program, ""
}

// legacyRow reduces one submission to a board row, preferring Phase 2 fields when
// present and falling back to the legacy score/duration otherwise.
func legacyRow(s domain.Submission, program, stream string, st *domain.Student) usecase.LegacyBoardRow {
	points := s.Points
	if points <= 0 {
		points = int(s.Score)
	}
	seconds := s.DurationSeconds
	if seconds <= 0 {
		seconds = usecase.ParseTimeSpend(s.TimeSpend)
	}
	r := usecase.LegacyBoardRow{
		SubmissionID: s.ID,
		ContestID:    s.ContestID,
		StudentID:    s.StudentID,
		ProgramID:    program,
		StreamID:     stream,
		Points:       points,
		Correct:      points,
		Total:        points + len(s.MissedQuestions),
		Seconds:      seconds,
		At:           s.SubmissionTime,
		Name:         s.Student.Name,
		AvatarURL:    s.Student.ImgURL,
	}
	if st != nil {
		r.Region = st.Region
	}
	return r
}

func strPtr(s string) *string { return &s }
