package usecase

import (
	"encoding/json"
	"log"
	"math"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	"victory-contest-go/internal/domain"
)

const academyMaxModuleBytes = 350 * 1024

/* ------------------------------- validation ------------------------------- */

// academySafeURL accepts empty, relative ("/…") and http(s) URLs only, so a
// stored link can never be a javascript:/data: payload rendered by the UI.
func academySafeURL(raw string) bool {
	raw = strings.TrimSpace(raw)
	if raw == "" || strings.HasPrefix(raw, "/") && !strings.HasPrefix(raw, "//") {
		return true
	}
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	return u.Scheme == "http" || u.Scheme == "https"
}

func academyValidModule(m *domain.AcademyModule) error {
	m.Title = strings.TrimSpace(m.Title)
	if m.Title == "" {
		return acErr(400, "title is required")
	}
	if len([]rune(m.Title)) > 200 {
		return acErr(400, "title is too long")
	}
	if !academyContains(academyDifficulties, m.Difficulty) {
		return acErr(400, "invalid difficulty")
	}
	if m.AccessStatus != domain.AcademyAccessFree && m.AccessStatus != domain.AcademyAccessPremium {
		return acErr(400, "invalid access_status")
	}
	switch m.PublishStatus {
	case domain.AcademyStatusPublished, domain.AcademyStatusDraft, domain.AcademyStatusScheduled, domain.AcademyStatusArchived:
	default:
		return acErr(400, "invalid publish_status")
	}
	for k, v := range m.ResourceAccess {
		if !academyContains(domain.AcademyResourceKeys, k) || (v != domain.AcademyAccessFree && v != domain.AcademyAccessPremium) {
			return acErr(400, "invalid resource_access")
		}
	}
	if m.EstimatedMinutes < 1 || m.EstimatedMinutes > 1000 {
		return acErr(400, "estimated_minutes must be between 1 and 1000")
	}
	if m.ReferralUnlock.RequiredReferrals < 1 {
		m.ReferralUnlock.RequiredReferrals = 2
	}
	if m.ReferralUnlock.RequiredReferrals > 20 {
		return acErr(400, "required_referrals must be at most 20")
	}
	if m.VideoLesson != nil {
		if !academySafeURL(m.VideoLesson.URL) || !academySafeURL(m.VideoLesson.InstructorAvatar) {
			return acErr(400, "video url must be http(s)")
		}
		if m.VideoLesson.Type != "direct" && m.VideoLesson.Type != "youtube" {
			return acErr(400, "video type must be direct or youtube")
		}
	}
	for _, d := range m.DocumentAttachments {
		if !academySafeURL(d.URL) {
			return acErr(400, "document url must be http(s)")
		}
	}
	for _, r := range m.Resources {
		if !academySafeURL(r.URL) {
			return acErr(400, "resource url must be http(s)")
		}
	}
	if m.Quiz != nil {
		if m.Quiz.PassingScorePercentage < 1 || m.Quiz.PassingScorePercentage > 100 {
			m.Quiz.PassingScorePercentage = 60
		}
		if m.Quiz.ID == "" {
			m.Quiz.ID = academyNewID("quiz")
		}
	}
	normalizeAcademyModule(m)
	b, err := json.Marshal(m)
	if err != nil || len(b) > academyMaxModuleBytes {
		return acErr(400, "module is too large (max 350 KB of content)")
	}
	return nil
}

/* --------------------------------- persist --------------------------------- */

func (u *AcademyUsecase) putDoc(kind, id string, v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	if err := u.repo.PutContent(kind, id, b); err != nil {
		return err
	}
	u.invalidate()
	return nil
}

func (u *AcademyUsecase) putModule(m *domain.AcademyModule) error {
	m.UpdatedAt = academyNow()
	return u.putDoc(academyKindModule, m.ID, m)
}

func (u *AcademyUsecase) requireModule(snap *academySnapshot, id string) (*domain.AcademyModule, error) {
	m := snap.modules[id]
	if m == nil {
		return nil, acErr(404, "module not found")
	}
	return m, nil
}

/* ---------------------------------- tree ---------------------------------- */

type AcademyAdminModuleRow struct {
	ID               string `json:"id"`
	Title            string `json:"title"`
	Order            int    `json:"order"`
	AccessStatus     string `json:"access_status"`
	PublishStatus    string `json:"publish_status"`
	Difficulty       string `json:"difficulty"`
	EstimatedMinutes int    `json:"estimated_minutes"`
	HasVideo         bool   `json:"has_video"`
	Flashcards       int    `json:"flashcards"`
	Questions        int    `json:"questions"`
	Documents        int    `json:"documents"`
}

type AcademyAdminChapter struct {
	domain.AcademyChapter
	Modules []AcademyAdminModuleRow `json:"modules"`
}

type AcademyAdminSubject struct {
	domain.AcademySubject
	Chapters []AcademyAdminChapter `json:"chapters"`
}

type AcademyAdminTree struct {
	Tree     []AcademyAdminSubject   `json:"tree"`
	Programs []domain.AcademyProgram `json:"programs"`
	Streams  []domain.AcademyStream  `json:"streams"`
}

func academyAdminRow(m *domain.AcademyModule) AcademyAdminModuleRow {
	row := AcademyAdminModuleRow{
		ID: m.ID, Title: m.Title, Order: m.Order, AccessStatus: m.AccessStatus,
		PublishStatus: m.PublishStatus, Difficulty: m.Difficulty, EstimatedMinutes: m.EstimatedMinutes,
		HasVideo: m.VideoLesson != nil, Flashcards: len(m.FlashcardDeck), Documents: len(m.DocumentAttachments),
	}
	if m.Quiz != nil {
		row.Questions = len(m.Quiz.Questions)
	}
	return row
}

func (u *AcademyUsecase) AdminTree(level, stream string) (*AcademyAdminTree, error) {
	snap, err := u.snapshot()
	if err != nil {
		return nil, err
	}
	out := &AcademyAdminTree{Tree: []AcademyAdminSubject{}, Programs: snap.programs, Streams: snap.streams}
	if out.Programs == nil {
		out.Programs = []domain.AcademyProgram{}
	}
	if out.Streams == nil {
		out.Streams = []domain.AcademyStream{}
	}
	for _, s := range snap.subjects {
		if level != "" && s.LevelID != level {
			continue
		}
		if stream != "" && stream != "all" && s.StreamID != stream {
			continue
		}
		sub := *s
		sub.ChaptersCount = len(snap.chaptersBySubject[s.ID])
		total := 0
		as := AcademyAdminSubject{Chapters: []AcademyAdminChapter{}}
		for _, ch := range snap.chaptersBySubject[s.ID] {
			rows := []AcademyAdminModuleRow{}
			for _, m := range snap.sortedModules(ch.ID, true) {
				rows = append(rows, academyAdminRow(m))
				total++
			}
			as.Chapters = append(as.Chapters, AcademyAdminChapter{AcademyChapter: *ch, Modules: rows})
		}
		sub.TotalModulesCount = total
		as.AcademySubject = sub
		out.Tree = append(out.Tree, as)
	}
	return out, nil
}

type AcademyAdminModuleDetail struct {
	Module  domain.AcademyModule   `json:"module"`
	Chapter *domain.AcademyChapter `json:"chapter"`
	Subject *domain.AcademySubject `json:"subject"`
}

func (u *AcademyUsecase) AdminGetModule(id string) (*AcademyAdminModuleDetail, error) {
	snap, err := u.snapshot()
	if err != nil {
		return nil, err
	}
	m, err := u.requireModule(snap, id)
	if err != nil {
		return nil, err
	}
	return &AcademyAdminModuleDetail{
		Module: academyClone(*m), Chapter: snap.chapters[m.ChapterID], Subject: snap.subjectByID[m.SubjectID],
	}, nil
}

/* --------------------------------- modules --------------------------------- */

func academyLastOrder(snap *academySnapshot, chapterID string) int {
	list := snap.sortedModules(chapterID, true)
	if len(list) == 0 {
		return 0
	}
	return list[len(list)-1].Order
}

func (u *AcademyUsecase) AdminCreateModule(raw []byte) (*domain.AcademyModule, error) {
	var in domain.AcademyModule
	if err := json.Unmarshal(raw, &in); err != nil {
		return nil, acErr(400, "invalid module payload")
	}
	snap, err := u.snapshot()
	if err != nil {
		return nil, err
	}
	chapter := snap.chapters[in.ChapterID]
	if chapter == nil {
		return nil, acErr(400, "chapter_id is invalid")
	}
	subject := snap.subjectByID[chapter.SubjectID]
	if subject == nil {
		return nil, acErr(400, "chapter has no subject")
	}
	in.Title = strings.TrimSpace(in.Title)
	m := in
	m.ID = academyNewID("mod")
	m.SubjectID, m.StreamID, m.LevelID = subject.ID, subject.StreamID, subject.LevelID
	m.Order = academyLastOrder(snap, chapter.ID) + 1
	if m.Difficulty == "" {
		m.Difficulty = "Beginner"
	}
	if m.EstimatedMinutes == 0 {
		m.EstimatedMinutes = 15
	}
	if m.AccessStatus == "" {
		m.AccessStatus = domain.AcademyAccessFree
		if chapter.IsPremium {
			m.AccessStatus = domain.AcademyAccessPremium
		}
	}
	if m.PublishStatus == "" {
		m.PublishStatus = domain.AcademyStatusDraft
	}
	if m.ReferralUnlock.RequiredReferrals == 0 {
		m.ReferralUnlock.RequiredReferrals = 2
	}
	if m.ReadingMarkdown == "" && m.Title != "" {
		m.ReadingMarkdown = "# " + m.Title + "\n\nStart writing…"
	}
	m.CreatedAt = academyNow()
	if err := academyValidModule(&m); err != nil {
		return nil, err
	}
	// flashcards keep their provenance
	for i := range m.FlashcardDeck {
		if m.FlashcardDeck[i].SourceModuleID == "" {
			m.FlashcardDeck[i].SourceModuleID = m.ID
		}
	}
	if err := u.putModule(&m); err != nil {
		return nil, err
	}
	return &m, nil
}

// academyProtectedModuleKeys are server-owned and ignored in update payloads.
var academyProtectedModuleKeys = []string{"id", "created_at", "updated_at", "subject_id", "level_id", "stream_id"}

func (u *AcademyUsecase) AdminUpdateModule(id string, raw []byte) (*domain.AcademyModule, error) {
	snap, err := u.snapshot()
	if err != nil {
		return nil, err
	}
	existing, err := u.requireModule(snap, id)
	if err != nil {
		return nil, err
	}
	var patch map[string]json.RawMessage
	if err := json.Unmarshal(raw, &patch); err != nil {
		return nil, acErr(400, "invalid module payload")
	}
	baseJSON, err := json.Marshal(existing)
	if err != nil {
		return nil, err
	}
	var merged map[string]json.RawMessage
	if err := json.Unmarshal(baseJSON, &merged); err != nil {
		return nil, err
	}
	for k, v := range patch {
		if academyContains(academyProtectedModuleKeys, k) {
			continue
		}
		merged[k] = v
	}
	mergedJSON, err := json.Marshal(merged)
	if err != nil {
		return nil, err
	}
	var m domain.AcademyModule
	if err := json.Unmarshal(mergedJSON, &m); err != nil {
		return nil, acErr(400, "invalid module payload")
	}
	m.ID, m.CreatedAt = existing.ID, existing.CreatedAt
	m.SubjectID, m.LevelID, m.StreamID = existing.SubjectID, existing.LevelID, existing.StreamID

	if m.ChapterID != existing.ChapterID {
		to := snap.chapters[m.ChapterID]
		if to == nil {
			return nil, acErr(400, "chapter_id is invalid")
		}
		subject := snap.subjectByID[to.SubjectID]
		if subject == nil {
			return nil, acErr(400, "chapter has no subject")
		}
		m.SubjectID, m.StreamID, m.LevelID = subject.ID, subject.StreamID, subject.LevelID
		m.Order = academyLastOrder(snap, to.ID) + 1
	}
	if err := academyValidModule(&m); err != nil {
		return nil, err
	}
	if err := u.putModule(&m); err != nil {
		return nil, err
	}
	return &m, nil
}

func (u *AcademyUsecase) deleteDraftsOf(snap *academySnapshot, moduleID string) {
	for _, d := range snap.drafts {
		if d.ModuleID == moduleID {
			if err := u.repo.DeleteContent(academyKindDraft, d.ID); err != nil {
				log.Printf("academy: delete draft %s: %v", d.ID, err)
			}
		}
	}
}

func (u *AcademyUsecase) AdminDeleteModule(id string) error {
	snap, err := u.snapshot()
	if err != nil {
		return err
	}
	if _, err := u.requireModule(snap, id); err != nil {
		return err
	}
	if err := u.repo.DeleteContent(academyKindModule, id); err != nil {
		return err
	}
	u.deleteDraftsOf(snap, id)
	u.invalidate()
	return nil
}

func (u *AcademyUsecase) AdminDuplicateModule(id string) (*domain.AcademyModule, error) {
	snap, err := u.snapshot()
	if err != nil {
		return nil, err
	}
	src, err := u.requireModule(snap, id)
	if err != nil {
		return nil, err
	}
	cp := academyClone(*src)
	cp.ID = academyNewID("mod")
	cp.Title = src.Title + " (copy)"
	cp.PublishStatus = domain.AcademyStatusDraft
	cp.Order = academyLastOrder(snap, src.ChapterID) + 1
	cp.CreatedAt = academyNow()
	if err := u.putModule(&cp); err != nil {
		return nil, err
	}
	return &cp, nil
}

type AcademyAccessPatch struct {
	AccessStatus   *string                       `json:"access_status"`
	ResourceAccess *map[string]string            `json:"resource_access"`
	ReferralUnlock *domain.AcademyReferralUnlock `json:"referral_unlock"`
}

func (u *AcademyUsecase) AdminSetAccess(id string, p AcademyAccessPatch) (*domain.AcademyModule, error) {
	snap, err := u.snapshot()
	if err != nil {
		return nil, err
	}
	src, err := u.requireModule(snap, id)
	if err != nil {
		return nil, err
	}
	m := academyClone(*src)
	if p.AccessStatus != nil && *p.AccessStatus != "" {
		m.AccessStatus = *p.AccessStatus
	}
	if p.ResourceAccess != nil {
		m.ResourceAccess = *p.ResourceAccess
	}
	if p.ReferralUnlock != nil {
		m.ReferralUnlock = *p.ReferralUnlock
	}
	if err := academyValidModule(&m); err != nil {
		return nil, err
	}
	if err := u.putModule(&m); err != nil {
		return nil, err
	}
	return &m, nil
}

func (u *AcademyUsecase) AdminSetStatus(id, status string) (*domain.AcademyModule, error) {
	switch status {
	case domain.AcademyStatusPublished, domain.AcademyStatusDraft, domain.AcademyStatusScheduled, domain.AcademyStatusArchived:
	default:
		return nil, acErr(400, "invalid publish_status")
	}
	snap, err := u.snapshot()
	if err != nil {
		return nil, err
	}
	src, err := u.requireModule(snap, id)
	if err != nil {
		return nil, err
	}
	m := academyClone(*src)
	m.PublishStatus = status
	if err := u.putModule(&m); err != nil {
		return nil, err
	}
	return &m, nil
}

func (u *AcademyUsecase) AdminReorderModule(id, direction string) error {
	snap, err := u.snapshot()
	if err != nil {
		return err
	}
	m, err := u.requireModule(snap, id)
	if err != nil {
		return err
	}
	sibs := append([]*domain.AcademyModule{}, snap.sortedModules(m.ChapterID, true)...)
	i := -1
	for k, x := range sibs {
		if x.ID == id {
			i = k
			break
		}
	}
	j := i + 1
	if direction == "up" {
		j = i - 1
	}
	if i < 0 || j < 0 || j >= len(sibs) {
		return nil
	}
	sibs[i], sibs[j] = sibs[j], sibs[i]
	for k, x := range sibs {
		if x.Order == k+1 {
			continue
		}
		cp := academyClone(*x)
		cp.Order = k + 1
		if err := u.putModule(&cp); err != nil {
			return err
		}
	}
	return nil
}

/* ---------------------------------- chapters ---------------------------------- */

func (u *AcademyUsecase) AdminCreateChapter(subjectID, title, description string, premium bool) (*domain.AcademyChapter, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return nil, acErr(400, "title is required")
	}
	snap, err := u.snapshot()
	if err != nil {
		return nil, err
	}
	if snap.subjectByID[subjectID] == nil {
		return nil, acErr(400, "subject_id is invalid")
	}
	c := domain.AcademyChapter{
		ID: academyNewID("chap"), SubjectID: subjectID, Title: title,
		OrderNumber: len(snap.chaptersBySubject[subjectID]) + 1,
		Description: description, IsPremium: premium, ModuleIDs: []string{},
	}
	if err := u.putDoc(academyKindChapter, c.ID, c); err != nil {
		return nil, err
	}
	return &c, nil
}

type AcademyChapterPatch struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	IsPremium   *bool   `json:"is_premium"`
}

func (u *AcademyUsecase) AdminUpdateChapter(id string, p AcademyChapterPatch) (*domain.AcademyChapter, error) {
	snap, err := u.snapshot()
	if err != nil {
		return nil, err
	}
	src := snap.chapters[id]
	if src == nil {
		return nil, acErr(404, "chapter not found")
	}
	c := academyClone(*src)
	if p.Title != nil {
		if strings.TrimSpace(*p.Title) == "" {
			return nil, acErr(400, "title is required")
		}
		c.Title = strings.TrimSpace(*p.Title)
	}
	if p.Description != nil {
		c.Description = *p.Description
	}
	if p.IsPremium != nil {
		c.IsPremium = *p.IsPremium
	}
	if err := u.putDoc(academyKindChapter, c.ID, c); err != nil {
		return nil, err
	}
	return &c, nil
}

func (u *AcademyUsecase) AdminDeleteChapter(id string) error {
	snap, err := u.snapshot()
	if err != nil {
		return err
	}
	if snap.chapters[id] == nil {
		return acErr(404, "chapter not found")
	}
	for _, m := range snap.modulesByChapter[id] {
		if err := u.repo.DeleteContent(academyKindModule, m.ID); err != nil {
			return err
		}
		u.deleteDraftsOf(snap, m.ID)
	}
	if err := u.repo.DeleteContent(academyKindChapter, id); err != nil {
		return err
	}
	u.invalidate()
	return nil
}

func (u *AcademyUsecase) AdminReorderChapter(id, direction string) error {
	snap, err := u.snapshot()
	if err != nil {
		return err
	}
	c := snap.chapters[id]
	if c == nil {
		return acErr(404, "chapter not found")
	}
	sibs := append([]*domain.AcademyChapter{}, snap.chaptersBySubject[c.SubjectID]...)
	i := -1
	for k, x := range sibs {
		if x.ID == id {
			i = k
			break
		}
	}
	j := i + 1
	if direction == "up" {
		j = i - 1
	}
	if i < 0 || j < 0 || j >= len(sibs) {
		return nil
	}
	sibs[i], sibs[j] = sibs[j], sibs[i]
	for k, x := range sibs {
		if x.OrderNumber == k+1 {
			continue
		}
		cp := academyClone(*x)
		cp.OrderNumber = k + 1
		if err := u.putDoc(academyKindChapter, cp.ID, cp); err != nil {
			return err
		}
	}
	return nil
}

/* ---------------------------- subjects / programs ---------------------------- */

func (u *AcademyUsecase) AdminCreateSubject(in domain.AcademySubject) (*domain.AcademySubject, error) {
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return nil, acErr(400, "name is required")
	}
	snap, err := u.snapshot()
	if err != nil {
		return nil, err
	}
	if in.LevelID == "" {
		in.LevelID = "grade-12"
	}
	if in.StreamID == "" {
		in.StreamID = "common"
	}
	if snap.programByID(in.LevelID) == nil {
		return nil, acErr(400, "level_id is invalid")
	}
	if snap.streamByID(in.StreamID) == nil {
		return nil, acErr(400, "stream_id is invalid")
	}
	if in.Code == "" {
		code := strings.ToUpper(in.Name)
		if r := []rune(code); len(r) > 4 {
			code = string(r[:4])
		}
		in.Code = code
	}
	if in.IconName == "" {
		in.IconName = "BookOpen"
	}
	if in.ColorTheme == "" {
		in.ColorTheme = "blue"
	}
	in.ID = academyNewID("sub")
	in.ChaptersCount, in.TotalModulesCount = 0, 0
	if err := u.putDoc(academyKindSubject, in.ID, in); err != nil {
		return nil, err
	}
	return &in, nil
}

func (u *AcademyUsecase) AdminSetProgramActive(id string, active bool) (*domain.AcademyProgram, error) {
	snap, err := u.snapshot()
	if err != nil {
		return nil, err
	}
	p := snap.programByID(id)
	if p == nil {
		return nil, acErr(404, "program not found")
	}
	cp := *p
	cp.IsActive = active
	if err := u.putDoc(academyKindProgram, cp.ID, cp); err != nil {
		return nil, err
	}
	return &cp, nil
}

/* ---------------------------------- AI drafts ---------------------------------- */

type AcademyGenerateDraftsInput struct {
	ModuleID   string   `json:"module_id"`
	Kinds      []string `json:"kinds"`
	Count      int      `json:"count"`
	Difficulty string   `json:"difficulty"`
	Source     string   `json:"source"`
}

func (u *AcademyUsecase) AdminGenerateDrafts(in AcademyGenerateDraftsInput) ([]domain.AcademyAiDraft, error) {
	snap, err := u.snapshot()
	if err != nil {
		return nil, err
	}
	m, err := u.requireModule(snap, in.ModuleID)
	if err != nil {
		return nil, err
	}
	kinds := in.Kinds
	if len(kinds) == 0 {
		kinds = []string{"flashcards", "quiz"}
	}
	if len(kinds) > 4 {
		return nil, acErr(400, "too many kinds")
	}
	count := academyClamp(in.Count, 1, 15)
	if in.Count == 0 {
		count = 6
	}
	diff := in.Difficulty
	if diff == "" {
		diff = "Mixed"
	}
	source := in.Source
	if source != "transcript" && source != "document" {
		source = "markdown"
	}
	made := []domain.AcademyAiDraft{}
	for _, kind := range kinds {
		d := domain.AcademyAiDraft{ID: academyNewID("draft"), ModuleID: m.ID, Kind: kind,
			Status: "pending", Source: source, CreatedAt: academyNow()}
		switch kind {
		case "flashcards":
			cards, err := u.generateFlashcards(m, count, diff)
			if err != nil {
				return nil, err
			}
			d.Flashcards = cards
		case "quiz":
			qs, err := u.generateQuiz(m, count, diff, []string{"multiple_choice", "true_false", "scenario"})
			if err != nil {
				return nil, err
			}
			d.Questions = qs
		case "summary":
			text, err := u.generateSummary(m)
			if err != nil {
				return nil, err
			}
			d.Text = &text
		case "key_concepts":
			items, err := u.generateKeyConcepts(m)
			if err != nil {
				return nil, err
			}
			d.Items = items
		default:
			return nil, acErr(400, "invalid draft kind")
		}
		made = append(made, d)
	}
	for _, d := range made {
		if err := u.putDoc(academyKindDraft, d.ID, d); err != nil {
			return nil, err
		}
	}
	return made, nil
}

func (u *AcademyUsecase) AdminListDrafts(moduleID string) ([]domain.AcademyAiDraft, error) {
	snap, err := u.snapshot()
	if err != nil {
		return nil, err
	}
	out := []domain.AcademyAiDraft{}
	for _, d := range snap.drafts {
		if moduleID == "" || d.ModuleID == moduleID {
			out = append(out, *d)
		}
	}
	return out, nil
}

type AcademyDraftPatch struct {
	Status     *string                       `json:"status"`
	Flashcards *[]domain.AcademyFlashcard    `json:"flashcards"`
	Questions  *[]domain.AcademyQuizQuestion `json:"questions"`
	Text       *string                       `json:"text"`
	Items      *[]string                     `json:"items"`
}

func (u *AcademyUsecase) AdminUpdateDraft(id string, p AcademyDraftPatch) (*domain.AcademyAiDraft, error) {
	snap, err := u.snapshot()
	if err != nil {
		return nil, err
	}
	var src *domain.AcademyAiDraft
	for _, d := range snap.drafts {
		if d.ID == id {
			src = d
			break
		}
	}
	if src == nil {
		return nil, acErr(404, "draft not found")
	}
	d := academyClone(*src)
	if p.Flashcards != nil {
		d.Flashcards = *p.Flashcards
	}
	if p.Questions != nil {
		d.Questions = *p.Questions
	}
	if p.Text != nil {
		d.Text = p.Text
	}
	if p.Items != nil {
		d.Items = *p.Items
	}
	if p.Status != nil {
		switch *p.Status {
		case "pending", "approved", "rejected":
		default:
			return nil, acErr(400, "invalid status")
		}
		wasApproved := d.Status == "approved"
		d.Status = *p.Status
		if d.Status == "approved" && !wasApproved {
			if err := u.applyApprovedDraft(snap, &d); err != nil {
				return nil, err
			}
		}
	}
	if err := u.putDoc(academyKindDraft, d.ID, d); err != nil {
		return nil, err
	}
	return &d, nil
}

// applyApprovedDraft publishes an approved AI draft into its module.
func (u *AcademyUsecase) applyApprovedDraft(snap *academySnapshot, d *domain.AcademyAiDraft) error {
	src, err := u.requireModule(snap, d.ModuleID)
	if err != nil {
		return err
	}
	m := academyClone(*src)
	switch {
	case d.Kind == "flashcards" && len(d.Flashcards) > 0:
		for i := range d.Flashcards {
			if d.Flashcards[i].ID == "" {
				d.Flashcards[i].ID = academyNewID("fc")
			}
			d.Flashcards[i].SourceModuleID = m.ID
		}
		m.FlashcardDeck = append(m.FlashcardDeck, d.Flashcards...)
	case d.Kind == "quiz" && len(d.Questions) > 0:
		for i := range d.Questions {
			if d.Questions[i].ID == "" {
				d.Questions[i].ID = academyNewID("q")
			}
		}
		if m.Quiz != nil {
			m.Quiz.Questions = append(m.Quiz.Questions, d.Questions...)
		} else {
			m.Quiz = &domain.AcademyModuleQuiz{ID: academyNewID("quiz"), Title: m.Title + " — Check",
				DurationMinutes: 10, PassingScorePercentage: 60, Questions: d.Questions}
		}
	case d.Kind == "summary" && d.Text != nil && strings.TrimSpace(*d.Text) != "":
		txt := strings.ReplaceAll(*d.Text, "**", "")
		if r := []rune(txt); len(r) > 280 {
			txt = string(r[:280])
		}
		m.Description = txt
	default:
		return nil
	}
	if err := academyValidModule(&m); err != nil {
		return err
	}
	return u.putModule(&m)
}

func (u *AcademyUsecase) AdminDeleteDraft(id string) error {
	if err := u.repo.DeleteContent(academyKindDraft, id); err != nil {
		return err
	}
	u.invalidate()
	return nil
}

/* ---------------------------------- analytics ---------------------------------- */

type AcademyModuleStat struct {
	ID              string `json:"id"`
	Title           string `json:"title"`
	SubjectName     string `json:"subject_name"`
	Views           int    `json:"views"`
	CompletionRate  int    `json:"completion_rate"`
	AvgMinutes      int    `json:"avg_minutes"`
	VideoCompletion int    `json:"video_completion"`
	FlashcardRecall int    `json:"flashcard_recall"`
	QuizAvg         int    `json:"quiz_avg"`
	AbandonRate     int    `json:"abandon_rate"`
	AccessStatus    string `json:"access_status"`
}

type AcademyAnalytics struct {
	TotalEnrollments  int                 `json:"total_enrollments"`
	FreeToPremiumRate float64             `json:"free_to_premium_rate"`
	TotalModules      int                 `json:"total_modules"`
	PublishedModules  int                 `json:"published_modules"`
	PremiumModules    int                 `json:"premium_modules"`
	Modules           []AcademyModuleStat `json:"modules"`
	WeakestTopics     []struct {
		Topic            string `json:"topic"`
		Subject          string `json:"subject"`
		ErrorRate        int    `json:"error_rate"`
		StudentsAffected int    `json:"students_affected"`
	} `json:"weakest_topics"`
	EngagementByLevel []struct {
		Level      string `json:"level"`
		Students   int    `json:"students"`
		Completion int    `json:"completion"`
	} `json:"engagement_by_level"`
	EngagementByStream []struct {
		Stream     string `json:"stream"`
		Students   int    `json:"students"`
		Completion int    `json:"completion"`
	} `json:"engagement_by_stream"`
	WeeklyActive []struct {
		Day     string `json:"day"`
		Free    int    `json:"free"`
		Premium int    `json:"premium"`
	} `json:"weekly_active"`
}

func academyPct(num, den int) int {
	if den <= 0 {
		return 0
	}
	return int(math.Round(float64(num) / float64(den) * 100))
}

var academyParens = regexp.MustCompile(`\s*\(.*\)`)

func (u *AcademyUsecase) AdminAnalytics() (*AcademyAnalytics, error) {
	snap, err := u.snapshot()
	if err != nil {
		return nil, err
	}
	states, err := u.repo.ListStudentStates()
	if err != nil {
		return nil, err
	}
	premium := map[string]bool{}
	if students, err := u.students.GetStudents(); err != nil {
		log.Printf("academy analytics: student lookup failed, treating everyone as free: %v", err)
	} else {
		for _, s := range students {
			if s.IsPremium {
				premium[s.ID] = true
				premium[s.TelegramID] = true
			}
		}
	}

	out := &AcademyAnalytics{TotalEnrollments: len(states), TotalModules: len(snap.modules)}
	out.Modules = []AcademyModuleStat{}
	premiumStudents := 0
	for _, s := range states {
		if premium[s.StudentID] {
			premiumStudents++
		}
	}
	if len(states) > 0 {
		out.FreeToPremiumRate = math.Round(float64(premiumStudents)/float64(len(states))*1000) / 10
	}

	mods := make([]*domain.AcademyModule, 0, len(snap.modules))
	for _, m := range snap.modules {
		mods = append(mods, m)
		if m.PublishStatus == domain.AcademyStatusPublished {
			out.PublishedModules++
		}
		if m.AccessStatus == domain.AcademyAccessPremium {
			out.PremiumModules++
		}
	}
	sort.Slice(mods, func(i, j int) bool {
		a, b := mods[i], mods[j]
		if a.SubjectID != b.SubjectID {
			return a.SubjectID < b.SubjectID
		}
		return a.Title < b.Title
	})

	staleCutoff := time.Now().Add(-7 * 24 * time.Hour).UTC().Format(time.RFC3339)
	for _, m := range mods {
		views, completed, videoDone, abandoned := 0, 0, 0, 0
		recallSum, recallN, quizSum, quizN := 0, 0, 0, 0
		for _, s := range states {
			if p, ok := s.ModuleProgress[m.ID]; ok {
				views++
				if p.Completed {
					completed++
				} else if p.LastStudiedAt != "" && p.LastStudiedAt < staleCutoff {
					abandoned++
				}
				if p.VideoCompleted {
					videoDone++
				}
			}
			if fp, ok := s.FlashcardProgress[m.ID]; ok {
				recallSum += fp.RecallRate
				recallN++
			}
			for _, a := range s.QuizAttempts {
				if a.ModuleID == m.ID {
					quizSum += a.Percentage
					quizN++
				}
			}
		}
		row := AcademyModuleStat{ID: m.ID, Title: m.Title, AccessStatus: m.AccessStatus,
			Views: views, CompletionRate: academyPct(completed, views), AbandonRate: academyPct(abandoned, views)}
		if sub := snap.subjectByID[m.SubjectID]; sub != nil {
			row.SubjectName = sub.Name
		}
		if views > 0 {
			row.AvgMinutes = m.EstimatedMinutes
		}
		if m.VideoLesson != nil {
			row.VideoCompletion = academyPct(videoDone, views)
		}
		if recallN > 0 {
			row.FlashcardRecall = int(math.Round(float64(recallSum) / float64(recallN)))
		}
		if quizN > 0 {
			row.QuizAvg = int(math.Round(float64(quizSum) / float64(quizN)))
		}
		out.Modules = append(out.Modules, row)
	}

	// weakest topics across every student's attempts
	type topicAgg struct {
		subject  string
		errSum   int
		n        int
		students map[string]bool
	}
	topics := map[string]*topicAgg{}
	for _, s := range states {
		for _, a := range s.QuizAttempts {
			m := snap.modules[a.ModuleID]
			if m == nil {
				continue
			}
			for _, t := range a.WeakTopics {
				agg := topics[t]
				if agg == nil {
					agg = &topicAgg{students: map[string]bool{}}
					if sub := snap.subjectByID[m.SubjectID]; sub != nil {
						agg.subject = sub.Name
					}
					topics[t] = agg
				}
				agg.errSum += 100 - a.Percentage
				agg.n++
				agg.students[s.StudentID] = true
			}
		}
	}
	type topicRow struct {
		topic string
		agg   *topicAgg
	}
	trs := make([]topicRow, 0, len(topics))
	for t, a := range topics {
		trs = append(trs, topicRow{t, a})
	}
	sort.Slice(trs, func(i, j int) bool {
		if len(trs[i].agg.students) != len(trs[j].agg.students) {
			return len(trs[i].agg.students) > len(trs[j].agg.students)
		}
		return trs[i].topic < trs[j].topic
	})
	for i, tr := range trs {
		if i >= 5 {
			break
		}
		out.WeakestTopics = append(out.WeakestTopics, struct {
			Topic            string `json:"topic"`
			Subject          string `json:"subject"`
			ErrorRate        int    `json:"error_rate"`
			StudentsAffected int    `json:"students_affected"`
		}{tr.topic, tr.agg.subject, int(math.Round(float64(tr.agg.errSum) / float64(tr.agg.n))), len(tr.agg.students)})
	}
	if out.WeakestTopics == nil {
		out.WeakestTopics = []struct {
			Topic            string `json:"topic"`
			Subject          string `json:"subject"`
			ErrorRate        int    `json:"error_rate"`
			StudentsAffected int    `json:"students_affected"`
		}{}
	}

	// completion of one student over their own level/stream plan
	completion := func(s domain.AcademyStudentState) int {
		plan := academyLevelStreamModules(snap, s.LevelID, s.StreamID)
		done := 0
		for _, m := range plan {
			if s.ModuleProgress[m.ID].Completed {
				done++
			}
		}
		return academyPct(done, len(plan))
	}
	levelStudents, levelSum := map[string]int{}, map[string]int{}
	streamStudents, streamSum := map[string]int{}, map[string]int{}
	for _, s := range states {
		c := completion(s)
		levelStudents[s.LevelID]++
		levelSum[s.LevelID] += c
		streamStudents[s.StreamID]++
		streamSum[s.StreamID] += c
	}
	out.EngagementByLevel = []struct {
		Level      string `json:"level"`
		Students   int    `json:"students"`
		Completion int    `json:"completion"`
	}{}
	for _, p := range snap.programs {
		n := levelStudents[p.ID]
		avg := 0
		if n > 0 {
			avg = int(math.Round(float64(levelSum[p.ID]) / float64(n)))
		}
		out.EngagementByLevel = append(out.EngagementByLevel, struct {
			Level      string `json:"level"`
			Students   int    `json:"students"`
			Completion int    `json:"completion"`
		}{academyParens.ReplaceAllString(p.Name, ""), n, avg})
	}
	out.EngagementByStream = []struct {
		Stream     string `json:"stream"`
		Students   int    `json:"students"`
		Completion int    `json:"completion"`
	}{}
	for _, st := range snap.streams {
		n := streamStudents[st.ID]
		avg := 0
		if n > 0 {
			avg = int(math.Round(float64(streamSum[st.ID]) / float64(n)))
		}
		out.EngagementByStream = append(out.EngagementByStream, struct {
			Stream     string `json:"stream"`
			Students   int    `json:"students"`
			Completion int    `json:"completion"`
		}{st.Name, n, avg})
	}

	// weekly active (current Mon..Sun, split free/premium)
	now := time.Now().In(academyTZ)
	monday := now.AddDate(0, 0, -((int(now.Weekday()) + 6) % 7))
	dayNames := []string{"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
	out.WeeklyActive = []struct {
		Day     string `json:"day"`
		Free    int    `json:"free"`
		Premium int    `json:"premium"`
	}{}
	for i, name := range dayNames {
		date := monday.AddDate(0, 0, i).Format("2006-01-02")
		free, prem := 0, 0
		for _, s := range states {
			if academyContains(s.ActiveDays, date) {
				if premium[s.StudentID] {
					prem++
				} else {
					free++
				}
			}
		}
		out.WeeklyActive = append(out.WeeklyActive, struct {
			Day     string `json:"day"`
			Free    int    `json:"free"`
			Premium int    `json:"premium"`
		}{name, free, prem})
	}
	return out, nil
}
