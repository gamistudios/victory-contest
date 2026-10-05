package usecase

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
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
// (UTF-8). The expected line format matches the parser this replaces on the
// frontend:
//
//	Subject: Chemistry
//	Grade: 9
//	Chapter: Atomic structure
//	Q1. What is ...?
//	A. option one
//	B. option two
//	Answer: 2          (1-based option index — the canonical convention)
//	Explanation: ...
//
// It errors on unsupported/binary formats and when nothing parses, so a
// mis-dropped file can never yield a garbage question list.
func ParseQuestionsDocument(filename string, content []byte) ([]domain.Question, error) {
	text, err := extractDocumentText(filename, content)
	if err != nil {
		return nil, err
	}
	questions := parseQuestionsWithChoices(text)
	if len(questions) == 0 {
		return nil, errors.New("no questions found in the file — expected lines like Subject:/Grade:/Q1./A./Answer:/Explanation:")
	}
	return questions, nil
}

// extractDocumentText turns the uploaded file into plain text. The magic-byte
// sniffs catch files saved with the wrong extension, so the format is decided
// by content first: ZIP → .docx unwrapping, %PDF → pdf text extraction,
// otherwise UTF-8 text (which rejects true binaries like legacy .doc).
func extractDocumentText(filename string, content []byte) (string, error) {
	if bytes.HasPrefix(content, []byte("PK\x03\x04")) || strings.EqualFold(filepath.Ext(filename), ".docx") {
		return docxText(content)
	}
	if bytes.HasPrefix(content, []byte("%PDF")) || strings.EqualFold(filepath.Ext(filename), ".pdf") {
		return pdfText(content)
	}
	if !utf8.Valid(content) {
		return "", errors.New("file is not readable text — supported formats are .pdf, .docx and .txt")
	}
	return string(content), nil
}

// pdfText extracts visible text from a PDF. Encrypted or scanned
// (image-only) PDFs carry no extractable text and fail with an error —
// there is no OCR here.
func pdfText(content []byte) (string, error) {
	r, err := pdf.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		return "", fmt.Errorf("not a readable PDF: %w", err)
	}
	pr, err := r.GetPlainText()
	if err != nil {
		return "", fmt.Errorf("extract PDF text (encrypted or scanned PDFs are not supported): %w", err)
	}
	text, err := io.ReadAll(pr)
	if err != nil {
		return "", fmt.Errorf("read PDF text: %w", err)
	}
	return string(text), nil
}

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

// The same patterns the frontend parser used. Choice matching stays
// case-sensitive (a./b. are prose, A./B. are options), everything else keeps
// the original case-insensitivity.
var (
	subjectRe  = regexp.MustCompile(`(?i)Subject:\s*(.*)`)
	gradeRe    = regexp.MustCompile(`(?i)Grade:\s*(\d+)`)
	chapterRe  = regexp.MustCompile(`(?i)Chapter:\s*(.*)`)
	questionRe = regexp.MustCompile(`(?i)^Q\d*\.?\s*(.*)`)
	choiceRe   = regexp.MustCompile(`^([A-D])\.\s*(.*)`)
	answerRe   = regexp.MustCompile(`(?i)^Answer:\s*(.*)`)
)

// parseState mirrors the JS parser's "what am I continuing?" marker so
// follow-up lines append to the last question/option/explanation.
type parseState struct {
	question, choice, exp bool
}

// parseQuestionsWithChoices is a faithful port of the frontend
// parseQuestionsWithChoices (processData.tsx): same regexes, same else-if
// order, same continuation semantics — line format changes live here now.
func parseQuestionsWithChoices(text string) []domain.Question {
	var (
		questions          []domain.Question
		current            *domain.Question
		grade, subject     string
		chapter            string
		change             parseState
	)
	flush := func() {
		if current != nil {
			questions = append(questions, *current)
			current = nil
		}
	}

	for _, line := range strings.Split(text, "\n") {
		if m := subjectRe.FindStringSubmatch(line); m != nil {
			subject = strings.TrimSpace(m[1])
		} else if m := gradeRe.FindStringSubmatch(line); m != nil {
			grade = strings.TrimSpace(m[1])
		} else if m := chapterRe.FindStringSubmatch(line); m != nil {
			chapter = strings.TrimSpace(m[1])
		} else if m := questionRe.FindStringSubmatch(line); m != nil {
			flush()
			current = &domain.Question{
				QuestionText: strings.TrimSpace(m[1]),
				Grade:        grade,
				Subject:      subject,
				Chapter:      chapter,
			}
			change = parseState{question: true}
		} else if m := choiceRe.FindStringSubmatch(line); m != nil && current != nil {
			current.MultipleChoice = append(current.MultipleChoice, strings.TrimSpace(m[2]))
			change = parseState{choice: true}
		} else if m := answerRe.FindStringSubmatch(line); m != nil && current != nil {
			current.Answer = parseAnswerIndex(m[1])
			change = parseState{}
		} else if strings.HasPrefix(line, "Explanation") && current != nil {
			current.Explanation += strings.TrimSpace(strings.Replace(line, "Explanation:", "", 1))
			change = parseState{exp: true}
		} else if current != nil {
			t := strings.TrimSpace(line)
			switch {
			case change.question:
				current.QuestionText += " " + t
			case change.choice:
				if n := len(current.MultipleChoice); n > 0 {
					current.MultipleChoice[n-1] += " " + t
				}
			case change.exp:
				current.Explanation += " " + t
			}
		}
	}
	flush()
	return questions
}

// parseAnswerIndex maps the "Answer:" line to the 1-based option index; an
// unparsable value lands on 0 (invalid) so the admin fixes it in the review
// list before submitting, matching what the old client parser produced.
func parseAnswerIndex(raw string) int {
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return 0
	}
	return n
}
