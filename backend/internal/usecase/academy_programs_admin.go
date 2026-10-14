package usecase

import (
	"encoding/json"
	"regexp"
	"strings"

	"victory-contest-go/internal/domain"
)

var academySlugRe = regexp.MustCompile(`[^a-z0-9]+`)

func academySlug(s string) string {
	return strings.Trim(academySlugRe.ReplaceAllString(strings.ToLower(strings.TrimSpace(s)), "-"), "-")
}

// validateProgramFields checks the closed sets (kind, features) and that every
// available stream exists. It normalises defaults in place.
func validateProgramFields(snap *academySnapshot, p *domain.AcademyProgram) error {
	p.Name = strings.TrimSpace(p.Name)
	if p.Name == "" {
		return acErr(400, "name is required")
	}
	if p.Kind == "" {
		p.Kind = "custom"
	}
	if !academyContains(domain.ValidProgramKinds, p.Kind) {
		return acErr(400, "kind is invalid")
	}
	seen := map[string]bool{}
	feats := make([]string, 0, len(p.Features))
	for _, f := range p.Features {
		if !academyContains(domain.ValidProgramFeatures, f) {
			return acErr(400, "unknown feature: "+f)
		}
		if !seen[f] {
			seen[f] = true
			feats = append(feats, f)
		}
	}
	p.Features = feats
	if len(p.AvailableStreams) == 0 {
		p.AvailableStreams = []string{"common"}
	}
	for _, sid := range p.AvailableStreams {
		if snap.streamByID(sid) == nil {
			return acErr(400, "stream is invalid: "+sid)
		}
	}
	if p.Grade != "" && !domain.IsValidGrade(p.Grade) {
		return acErr(400, "grade must be one of the allowed grades")
	}
	if p.ShortCode == "" {
		code := strings.ToUpper(p.Name)
		if r := []rune(code); len(r) > 4 {
			code = string(r[:4])
		}
		p.ShortCode = code
	}
	if p.IconName == "" {
		p.IconName = "GraduationCap"
	}
	return nil
}

// AdminCreateProgram creates a program (plan §5.1: programs are data).
func (u *AcademyUsecase) AdminCreateProgram(in domain.AcademyProgram) (*domain.AcademyProgram, error) {
	snap, err := u.snapshot()
	if err != nil {
		return nil, err
	}
	if err := validateProgramFields(snap, &in); err != nil {
		return nil, err
	}
	id := academySlug(in.ID)
	if id == "" {
		id = academySlug(in.Name)
	}
	if id == "" {
		return nil, acErr(400, "could not derive an id from the name")
	}
	if snap.programByID(id) != nil {
		return nil, acErr(409, "a program with this id already exists")
	}
	in.ID = id
	in.TotalModulesCount = 0
	if in.SortOrder <= 0 {
		in.SortOrder = len(snap.programs)*10 + 10
	}
	if err := u.putDocIfAbsent(academyKindProgram, in.ID, in); err != nil {
		return nil, err
	}
	u.invalidate()
	return &in, nil
}

// AdminUpdateProgram replaces the editable fields of a program (id and active
// flag are preserved; use AdminSetProgramActive to soft-delete).
func (u *AcademyUsecase) AdminUpdateProgram(id string, in domain.AcademyProgram) (*domain.AcademyProgram, error) {
	snap, err := u.snapshot()
	if err != nil {
		return nil, err
	}
	cur := snap.programByID(id)
	if cur == nil {
		return nil, acErr(404, "program not found")
	}
	if err := validateProgramFields(snap, &in); err != nil {
		return nil, err
	}
	in.ID = cur.ID
	in.IsActive = cur.IsActive
	in.TotalModulesCount = cur.TotalModulesCount
	if in.SortOrder <= 0 {
		in.SortOrder = cur.SortOrder
	}
	if err := u.putDoc(academyKindProgram, in.ID, in); err != nil {
		return nil, err
	}
	return &in, nil
}

// AdminMoveSubject moves a subject to another program/stream and cascades the
// new level/stream to every module under its chapters. The target stream must
// be one the target program offers.
func (u *AcademyUsecase) AdminMoveSubject(subjectID, programID, streamID string) (*domain.AcademySubject, error) {
	snap, err := u.snapshot()
	if err != nil {
		return nil, err
	}
	sub := snap.subjectByID[subjectID]
	if sub == nil {
		return nil, acErr(404, "subject not found")
	}
	prog := snap.programByID(programID)
	if prog == nil {
		return nil, acErr(400, "program_id is invalid")
	}
	if streamID == "" {
		streamID = "common"
	}
	if snap.streamByID(streamID) == nil {
		return nil, acErr(400, "stream_id is invalid")
	}
	if streamID != domain.StreamCommon && !prog.AllowsStream(streamID) {
		return nil, acErr(400, "the target program does not offer this stream")
	}
	cp := *sub
	cp.LevelID, cp.StreamID = programID, streamID
	if err := u.putDoc(academyKindSubject, cp.ID, cp); err != nil {
		return nil, err
	}
	for _, ch := range snap.chaptersBySubject[subjectID] {
		for _, m := range snap.sortedModules(ch.ID, true) {
			mc := *m
			mc.LevelID, mc.StreamID = programID, streamID
			if err := u.putModule(&mc); err != nil {
				return nil, err
			}
		}
	}
	u.invalidate()
	return &cp, nil
}

// putDocIfAbsent writes a document only when the id is free (race-free create).
func (u *AcademyUsecase) putDocIfAbsent(kind, id string, v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	ok, err := u.repo.PutContentIfAbsent(kind, id, b)
	if err != nil {
		return err
	}
	if !ok {
		return acErr(409, "a program with this id already exists")
	}
	u.invalidate()
	return nil
}
