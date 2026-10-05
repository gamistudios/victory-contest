package usecase

import (
	"archive/zip"
	"bytes"
	"fmt"
	"strings"
	"testing"

	"victory-contest-go/internal/domain"
)

const bulkFixture = `Subject: Chemistry
Grade: 9
Chapter: Atomic Structure
Q1. What is the atomic number of carbon?
A. 4
B. 6
C. 12
D. 14
Answer: 2
Explanation: Carbon has six protons.
Q2. Which particle is neutral?
A. Proton
B. Electron
C. Neutron
Answer: 3
Explanation: Neutrons carry no charge.
`

// assertParsedBulkFixture asserts the shared fixture parsed into the two
// expected questions with metadata, choices, 1-based answers and explanation.
func assertParsedBulkFixture(t *testing.T, questions []domain.Question) {
	t.Helper()
	if len(questions) != 2 {
		t.Fatalf("parsed %d questions, want 2", len(questions))
	}
	q1 := questions[0]
	if got := q1.QuestionText; got != "What is the atomic number of carbon?" {
		t.Fatalf("q1 text = %q", got)
	}
	if q1.Subject != "Chemistry" || q1.Grade != "9" || q1.Chapter != "Atomic Structure" {
		t.Fatalf("q1 metadata = %q/%q/%q", q1.Subject, q1.Grade, q1.Chapter)
	}
	wantChoices := []string{"4", "6", "12", "14"}
	if strings.Join(q1.MultipleChoice, "|") != strings.Join(wantChoices, "|") {
		t.Fatalf("q1 choices = %v, want %v", q1.MultipleChoice, wantChoices)
	}
	if q1.Answer != 2 {
		t.Fatalf("q1 answer = %d, want 2 (1-based option index)", q1.Answer)
	}
	if q1.Explanation != "Carbon has six protons." {
		t.Fatalf("q1 explanation = %q", q1.Explanation)
	}
	q2 := questions[1]
	if len(q2.MultipleChoice) != 3 || q2.Answer != 3 {
		t.Fatalf("q2 = %d options, answer %d", len(q2.MultipleChoice), q2.Answer)
	}
	if q2.Grade != "9" {
		t.Fatalf("q2 should inherit grade from the header, got %q", q2.Grade)
	}
}

// TestParseQuestionsDocumentTextFile covers the plain .txt happy path,
// including CRLF line endings.
func TestParseQuestionsDocumentTextFile(t *testing.T) {
	questions, err := ParseQuestionsDocument("bank.txt", []byte(strings.ReplaceAll(bulkFixture, "\n", "\r\n")))
	if err != nil {
		t.Fatalf("ParseQuestionsDocument: %v", err)
	}
	assertParsedBulkFixture(t, questions)
}

// TestParseQuestionsDocumentDocx builds a minimal .docx (zip with
// word/document.xml) and asserts text runs concatenate into the same parse.
func TestParseQuestionsDocumentDocx(t *testing.T) {
	paragraph := func(runs ...string) string {
		var b strings.Builder
		b.WriteString("<w:p>")
		for _, r := range runs {
			b.WriteString("<w:r><w:t>" + r + "</w:t></w:r>")
		}
		b.WriteString("</w:p>")
		return b.String()
	}
	var body strings.Builder
	body.WriteString(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`)
	for _, line := range strings.Split(strings.TrimSuffix(bulkFixture, "\n"), "\n") {
		// Split the question line across two runs to prove run
		// concatenation, mirroring how Word stores edited text.
		if strings.HasPrefix(line, "Q1.") {
			body.WriteString(paragraph("Q1. What is", " the atomic number of carbon?"))
		} else {
			body.WriteString(paragraph(line))
		}
	}
	body.WriteString(`</w:body></w:document>`)

	var zipBuf bytes.Buffer
	zw := zip.NewWriter(&zipBuf)
	w, err := zw.Create("word/document.xml")
	if err != nil {
		t.Fatalf("zip create: %v", err)
	}
	if _, err := w.Write([]byte(body.String())); err != nil {
		t.Fatalf("zip write: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("zip close: %v", err)
	}

	questions, err := ParseQuestionsDocument("bank.docx", zipBuf.Bytes())
	if err != nil {
		t.Fatalf("ParseQuestionsDocument: %v", err)
	}
	assertParsedBulkFixture(t, questions)
}

// TestParseQuestionsDocumentPDF builds a minimal valid PDF with one BT/ET
// text block per line (the lib emits a newline per BT) and asserts the same
// parse result.
func TestParseQuestionsDocumentPDF(t *testing.T) {
	pdfBytes := buildTestPDF(strings.Split(strings.TrimSuffix(bulkFixture, "\n"), "\n"))
	questions, err := ParseQuestionsDocument("bank.pdf", pdfBytes)
	if err != nil {
		t.Fatalf("ParseQuestionsDocument: %v", err)
	}
	assertParsedBulkFixture(t, questions)
}

// buildTestPDF assembles a single-page PDF whose content stream shows each
// line in its own BT/ET text object.
func buildTestPDF(lines []string) []byte {
	var content strings.Builder
	for i, line := range lines {
		if strings.ContainsAny(line, "()\\") {
			panic("fixture line contains PDF escape characters: " + line)
		}
		fmt.Fprintf(&content, "BT /F1 12 Tf 72 %d Td (%s) Tj ET\n", 750-i*14, line)
	}
	stream := content.String()

	objects := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
		fmt.Sprintf("<< /Length %d >>\nstream\n%sendstream", len(stream), stream),
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
	}

	var buf bytes.Buffer
	buf.WriteString("%PDF-1.4\n")
	offsets := make([]int, len(objects))
	for i, obj := range objects {
		offsets[i] = buf.Len()
		fmt.Fprintf(&buf, "%d 0 obj\n%s\nendobj\n", i+1, obj)
	}
	xrefStart := buf.Len()
	fmt.Fprintf(&buf, "xref\n0 %d\n", len(objects)+1)
	buf.WriteString("0000000000 65535 f \n")
	for _, off := range offsets {
		fmt.Fprintf(&buf, "%010d 00000 n \n", off)
	}
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objects)+1, xrefStart)
	return buf.Bytes()
}

// TestParseQuestionsDocumentRejectsGarbage pins the failure modes that made
// the old client-side parser render binary as "questions": unsupported
// binaries must error, never produce a question list.
func TestParseQuestionsDocumentRejectsGarbage(t *testing.T) {
	t.Run("binary bytes in a .txt", func(t *testing.T) {
		garbage := []byte{0x50, 0x4b, 0x00, 0xff, 0xfe, 0x00, 0xd0, 0xcf, 0x11, 0xe0}
		if _, err := ParseQuestionsDocument("bank.txt", garbage); err == nil {
			t.Fatal("expected binary garbage to be rejected")
		}
	})

	t.Run("docx extension but not a zip", func(t *testing.T) {
		if _, err := ParseQuestionsDocument("bank.docx", []byte("plain text, not a zip")); err == nil {
			t.Fatal("expected non-zip .docx to be rejected")
		}
	})

	t.Run("pdf extension but not a pdf", func(t *testing.T) {
		if _, err := ParseQuestionsDocument("bank.pdf", []byte("plain text, not a pdf")); err == nil {
			t.Fatal("expected non-pdf .pdf to be rejected")
		}
	})

	t.Run("readable text without any question lines", func(t *testing.T) {
		if _, err := ParseQuestionsDocument("bank.txt", []byte("hello world\nnothing to see here")); err == nil || !strings.Contains(err.Error(), "no questions found") {
			t.Fatalf("expected no-questions error, got %v", err)
		}
	})
}
