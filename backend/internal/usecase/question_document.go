package usecase

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"math"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/ledongthuc/pdf"
	"victory-contest-go/internal/domain"
)

// ParseQuestionsDocument extracts questions from an uploaded question-bank
// document so the admin panel can review and edit them before persisting via
// POST /api/question/multiple-add. Supported formats: .pdf, .docx (the zip's
// word/document.xml is unwrapped to plain text with the stdlib) and .txt
// (UTF-8). Two line layouts are understood (they mix freely):
//
//	Subject: Chemistry              1. What is ...?          (numbered, as in
//	Grade: 9                        a. option one             exported exam PDFs;
//	Chapter: Atomic structure       b. option two             lowercase options)
//	Q1. What is ...?                Answer: 2                 (inline numeric)
//	A. option one
//	B. option two                   Answer key:               (trailing key, as
//	Answer: 2                       1. Answer: C                in exported exam
//	Explanation: ...                Explanation: ...            PDFs; letter form)
//
// Question numbers tie the trailing key back to its question, so the merged
// result carries the 1-based answer index and the explanation. Repeated page
// headers/footers (title lines seen 3+ times, "Download ..." ad footers) are
// dropped instead of leaking into question text. The parser errors on
// unsupported/binary formats and when nothing parses, so a mis-dropped file
// can never yield a garbage question list.
func ParseQuestionsDocument(filename string, content []byte) ([]domain.Question, error) {
	text, err := extractDocumentText(filename, content)
	if err != nil {
		return nil, err
	}
	numbered := parseNumberedQuestions(text)
	if len(numbered) == 0 {
		return nil, errors.New("no questions found in the file — expected numbered questions (1. / Q1.) with a., b., ... options and an Answer:/Answer key: section")
	}
	questions := make([]domain.Question, 0, len(numbered))
	for _, nq := range numbered {
		questions = append(questions, nq.q)
	}
	return questions, nil
}

// extractDocumentText turns the uploaded file into plain text. The magic-byte
// sniffs catch files saved with the wrong extension, so the format is decided
// by content first: ZIP → .docx unwrapping, %PDF → pdf text extraction,
// otherwise UTF-8 text (which rejects true binaries like legacy .doc).
func extractDocumentText(filename string, content []byte) (string, error) {
	pages, err := extractDocumentPages(filename, content)
	if err != nil {
		return "", err
	}
	return strings.Join(pages, "\n"), nil
}

// extractDocumentPages splits the document into per-page plain text (one
// chunk for formats without pages).
func extractDocumentPages(filename string, content []byte) ([]string, error) {
	if bytes.HasPrefix(content, []byte("PK\x03\x04")) || strings.EqualFold(filepath.Ext(filename), ".docx") {
		text, err := docxText(content)
		if err != nil {
			return nil, err
		}
		return []string{text}, nil
	}
	if bytes.HasPrefix(content, []byte("%PDF")) || strings.EqualFold(filepath.Ext(filename), ".pdf") {
		return pdfTextPages(content)
	}
	if !utf8.Valid(content) {
		return nil, errors.New("file is not readable text — supported formats are .pdf, .docx and .txt")
	}
	return []string{string(content)}, nil
}

// pdfText extracts all visible PDF text (pages joined with newlines); see
// pdfTextPages for the geometric line-reconstruction rules.
func pdfText(content []byte) (string, error) {
	pages, err := pdfTextPages(content)
	if err != nil {
		return "", err
	}
	return strings.Join(pages, "\n"), nil
}

// pdfTextPages extracts visible text per page. Lines are rebuilt from glyph
// geometry: every text fragment carries its own X/Y position, so a new line
// starts whenever the baseline jumps and a space is inserted wherever the
// horizontal gap demands one. This is independent of which text-positioning
// operators the producer used (GetPlainText alone misses line breaks on
// single-BT pages, which collapsed whole pages into one line). Encrypted or
// scanned (image-only) PDFs yield no text and fail — there is no OCR here.
func pdfTextPages(content []byte) (pages []string, err error) {
	defer func() {
		if r := recover(); r != nil {
			pages, err = nil, fmt.Errorf("not a readable PDF: %v", r)
		}
	}()
	r, err := pdf.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		return nil, fmt.Errorf("not a readable PDF: %w", err)
	}
	var sb strings.Builder
	for i := 1; i <= r.NumPage(); i++ {
		page := r.Page(i)
		if page.V.IsNull() {
			continue
		}
		lastWritten := byte(0)
		writeStr := func(s string) {
			if s == "" {
				return
			}
			sb.WriteString(s)
			lastWritten = s[len(s)-1]
		}
		endsWithSpace := func() bool { return lastWritten == ' ' || lastWritten == '\n' }
		var last *pdf.Text
		for _, t := range page.Content().Text {
			if strings.TrimSpace(t.S) == "" {
				// A standalone space glyph (per-character PDFs emit one per
				// space): keep it as a single space unless a line break is
				// pending anyway.
				if last != nil && math.Abs(t.Y-last.Y) > sameLineEpsilon {
					writeStr("\n")
				} else if last != nil && !endsWithSpace() {
					writeStr(" ")
				}
				last = &pdf.Text{X: t.X, Y: t.Y, W: t.W, FontSize: t.FontSize}
				continue
			}
			if last != nil {
				if math.Abs(t.Y-last.Y) > sameLineEpsilon {
					writeStr("\n")
				} else if t.X-last.X-last.W > spaceGapInFontSizes*last.FontSize && !endsWithSpace() {
					// Spaces encoded as positioning only (TJ kerning) rather
					// than glyphs: the horizontal gap is the word boundary.
					writeStr(" ")
				}
			}
			writeStr(t.S)
			last = &pdf.Text{X: t.X, Y: t.Y, W: t.W, FontSize: t.FontSize}
		}
		writeStr("\n")
		pages = append(pages, sb.String())
		sb.Reset()
	}
	for _, p := range pages {
		if strings.TrimSpace(p) != "" {
			return pages, nil
		}
	}
	return nil, errors.New("no extractable text in the PDF — encrypted or scanned (image-only) PDFs are not supported")
}

// sameLineEpsilon is the baseline jitter (in points) still considered one
// line; spaceGapInFontSizes is the horizontal gap (in font-size units) that
// means a word boundary between two fragments.
const (
	sameLineEpsilon     = 2.0
	spaceGapInFontSizes = 0.2
)

// docxText extracts the visible text of a .docx (a ZIP whose word/document.xml
// holds the body): text runs inside <w:t> are concatenated, <w:tab>/<w:br>
// become whitespace, and each paragraph <w:p> ends with a newline.
func docxText(content []byte) (string, error) {
	zr, err := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		return "", fmt.Errorf("not a readable .docx document: %w", err)
	}
	var body io.ReadCloser
	for _, f := range zr.File {
		if f.Name == "word/document.xml" {
			if body, err = f.Open(); err != nil {
				return "", fmt.Errorf("open .docx body: %w", err)
			}
			break
		}
	}
	if body == nil {
		return "", errors.New("not a readable .docx document: word/document.xml missing")
	}
	defer body.Close()

	var sb strings.Builder
	inTextRun, inParagraph := false, false
	dec := xml.NewDecoder(body)
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", fmt.Errorf("malformed .docx body: %w", err)
		}
		switch t := tok.(type) {
		case xml.StartElement:
			switch t.Name.Local {
			case "p":
				inParagraph = true
			case "t":
				inTextRun = true
			case "tab", "br":
				if inParagraph {
					sb.WriteString(" ")
				}
			}
		case xml.EndElement:
			switch t.Name.Local {
			case "p":
				sb.WriteString("\n")
				inParagraph = false
			case "t":
				inTextRun = false
			}
		case xml.CharData:
			if inTextRun {
				sb.Write(t)
			}
		}
	}
	return sb.String(), nil
}

// The line grammars. Case-sensitivity is deliberate: "a." options and "A."
// options are both accepted, but prose sentences must never match a question
// or an option. The question text group rejects a leading digit so wrapped
// numeric fragments ("0.30 mol CO...", "1.0MZnSO4...") keep being treated as
// continuation text instead of spawning bogus questions.
var (
	subjectRe      = regexp.MustCompile(`(?i)Subject:\s*(.*)`)
	gradeRe        = regexp.MustCompile(`(?i)Grade:\s*(\d+)`)
	chapterRe      = regexp.MustCompile(`(?i)Chapter:\s*(.*)`)
	questionRe     = regexp.MustCompile(`^(?i:Q\s*)?(\d{1,3})\s*[.)]\s*(\D.*)`)
	questionBareRe = regexp.MustCompile(`^(?i:Q\s*)?(\d{1,3})\s+([A-Z].*)`)
	choiceRe       = regexp.MustCompile(`^(?i:[a-d])[.)]\s*(.*)`)
	answerRe       = regexp.MustCompile(`(?i)^Answer\s*:\s*(.*)`)
	answerKeyRe    = regexp.MustCompile(`(?i)^answer key\b`)
	keyAnswerRe    = regexp.MustCompile(`(?i)^(?:Q\s*)?(\d{1,3})\s*[.)]?\s*Answer\s*:\s*([a-d])\b`)
	explanationRe  = regexp.MustCompile(`(?i)^Explanation[:\]]?\s*`)
	downloadRe     = regexp.MustCompile(`(?i)^download\b`)
)

// parseState mirrors the original parser's "what am I continuing?" marker so
// follow-up lines append to the last question/option/explanation.
type parseState struct {
	question, choice, exp bool
}

// numberedQuestion keeps the question's own number ("1.", "Q3.", "16 ") so a
// trailing answer-key section can be merged back onto it.
type numberedQuestion struct {
	num int
	q   domain.Question
}

// parseNumberedQuestions runs the two-mode single pass: everything before an
// "Answer key:" line builds the question list, everything after it only
// contributes per-number answers and explanations. Boilerplate repeated on
// every page is removed before parsing.
func parseNumberedQuestions(text string) []numberedQuestion {
	var (
		questions         []numberedQuestion
		current           *numberedQuestion
		grade, subject    string
		chapter           string
		change            parseState
		keyMode           bool
		answers           = map[int]int{}    // question number → 1-based option index
		keyExplanations   = map[int]string{} // question number → key explanation
		keyExplanationFor = -1
	)
	flush := func() {
		if current != nil {
			questions = append(questions, *current)
			current = nil
		}
	}
	newQuestion := func(num int, text string) {
		flush()
		current = &numberedQuestion{num: num, q: domain.Question{
			QuestionText: strings.TrimSpace(text),
			Grade:        grade,
			Subject:      subject,
			Chapter:      chapter,
		}}
		change = parseState{question: true}
	}

	for _, line := range dropBoilerplate(strings.Split(text, "\n")) {
		if answerKeyRe.MatchString(line) {
			flush()
			keyMode = true
			change = parseState{}
			continue
		}

		if keyMode {
			// The key section never creates questions; it only binds answers
			// and explanations to earlier question numbers.
			if m := keyAnswerRe.FindStringSubmatch(line); m != nil {
				num, _ := strconv.Atoi(m[1])
				answers[num] = letterOptionIndex(m[2])
				keyExplanationFor = num
				continue
			}
			if explanationRe.MatchString(line) {
				if keyExplanationFor >= 0 {
					keyExplanations[keyExplanationFor] += explanationRe.ReplaceAllString(line, "")
				}
				continue
			}
			if keyExplanationFor >= 0 {
				keyExplanations[keyExplanationFor] += " " + line
			}
			continue
		}

		// Question mode. A numbered letter answer ("1. Answer: C") binds the
		// answer even without an "Answer key:" header.
		if m := keyAnswerRe.FindStringSubmatch(line); m != nil {
			num, _ := strconv.Atoi(m[1])
			answers[num] = letterOptionIndex(m[2])
			keyExplanationFor = num
			change = parseState{}
			continue
		}
		if m := subjectRe.FindStringSubmatch(line); m != nil {
			subject = strings.TrimSpace(m[1])
		} else if m := gradeRe.FindStringSubmatch(line); m != nil {
			grade = strings.TrimSpace(m[1])
		} else if m := chapterRe.FindStringSubmatch(line); m != nil {
			chapter = strings.TrimSpace(m[1])
		} else if m := questionRe.FindStringSubmatch(line); m != nil {
			num, _ := strconv.Atoi(m[1])
			newQuestion(num, m[2])
		} else if m := questionBareRe.FindStringSubmatch(line); m != nil {
			// "16 Consider the following..." — some exports drop the dot.
			num, _ := strconv.Atoi(m[1])
			newQuestion(num, m[2])
		} else if m := choiceRe.FindStringSubmatch(line); m != nil && current != nil {
			current.q.MultipleChoice = append(current.q.MultipleChoice, strings.TrimSpace(m[1]))
			change = parseState{choice: true}
		} else if m := answerRe.FindStringSubmatch(line); m != nil && current != nil {
			current.q.Answer = parseAnswerIndex(m[1])
			change = parseState{}
		} else if explanationRe.MatchString(line) && current != nil {
			current.q.Explanation += explanationRe.ReplaceAllString(line, "")
			change = parseState{exp: true}
		} else if current != nil {
			switch {
			case change.question:
				current.q.QuestionText += " " + line
			case change.choice:
				if n := len(current.q.MultipleChoice); n > 0 {
					current.q.MultipleChoice[n-1] += " " + line
				}
			case change.exp:
				current.q.Explanation += " " + line
			}
		}
	}
	flush()

	// Merge the trailing key: an inline numeric answer wins, the key fills
	// the rest and contributes the explanations.
	for i := range questions {
		nq := &questions[i]
		if nq.q.Answer == 0 {
			if ans, ok := answers[nq.num]; ok {
				nq.q.Answer = ans
			}
		}
		if keyExp, ok := keyExplanations[nq.num]; ok {
			if strings.TrimSpace(nq.q.Explanation) == "" {
				nq.q.Explanation = keyExp
			} else {
				nq.q.Explanation += " " + keyExp
			}
		}
	}
	return questions
}

// dropBoilerplate removes paginated-document noise before parsing: "Download
// ..." ad footers, and any line repeated 3+ times (page headers) that isn't a
// structural line — repeated options like "a. True" survive because they
// match the option grammar.
func dropBoilerplate(lines []string) []string {
	counts := make(map[string]int, len(lines))
	trimmed := make([]string, 0, len(lines))
	for _, l := range lines {
		t := strings.TrimSpace(l)
		trimmed = append(trimmed, t)
		counts[t]++
	}
	out := make([]string, 0, len(trimmed))
	for _, t := range trimmed {
		if t == "" || downloadRe.MatchString(t) {
			continue
		}
		if counts[t] >= 3 && !isStructuralLine(t) {
			continue
		}
		out = append(out, t)
	}
	return out
}

// isStructuralLine reports whether the line carries parseable meaning, as
// opposed to page furniture.
func isStructuralLine(t string) bool {
	return subjectRe.MatchString(t) || gradeRe.MatchString(t) || chapterRe.MatchString(t) ||
		questionRe.MatchString(t) || questionBareRe.MatchString(t) || choiceRe.MatchString(t) ||
		answerRe.MatchString(t) || keyAnswerRe.MatchString(t) || answerKeyRe.MatchString(t) ||
		explanationRe.MatchString(t)
}

// letterOptionIndex maps a/b/c/d (any case) to the 1-based option index the
// whole stack standardizes on.
func letterOptionIndex(letter string) int {
	if letter == "" {
		return 0
	}
	switch c := letter[0] | 0x20; {
	case c >= 'a' && c <= 'd':
		return int(c-'a') + 1
	default:
		return 0
	}
}

// parseAnswerIndex maps an inline "Answer:" value to the 1-based option
// index: numeric ("2") as-is, a lone letter ("C (3rd option…)") via its
// position, anything else to 0 (invalid) so the admin fixes it in review.
func parseAnswerIndex(raw string) int {
	s := strings.TrimSpace(raw)
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	// A letter only counts when it stands alone ("C", "C (3rd option…)"),
	// not as the first letter of a word ("Carbon").
	if len(s) > 0 {
		if c := s[0] | 0x20; c >= 'a' && c <= 'd' && (len(s) == 1 || !isASCIILetter(s[1])) {
			return int(c-'a') + 1
		}
	}
	return 0
}

func isASCIILetter(c byte) bool {
	l := c | 0x20
	return l >= 'a' && l <= 'z'
}
