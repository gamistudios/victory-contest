package usecase

import (
	"archive/zip"
	"bytes"
	"compress/zlib"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// fakeComplete returns a canned AI response (and records the prompt/images it
// received) without any network.
type fakeComplete struct {
	prompt   string
	images   []DocumentImage
	response string
	err      error
}

func (f *fakeComplete) complete(prompt string, images []DocumentImage) (string, error) {
	f.prompt = prompt
	f.images = images
	return f.response, f.err
}

// TestParseQuestionsWithAI pins the AI structuring contract: JSON array found
// inside prose, per-question validation drops garbage entries, image tags are
// preserved, and failures surface as errors.
func TestParseQuestionsWithAI(t *testing.T) {
	validJSON := `Here are the questions.
[
  {
    "question_text": "What is the atomic number of carbon?",
    "multiple_choice": ["4", "6", "12", "14"],
    "answer": 2,
    "explanation": "Carbon has six protons.",
    "grade": "9", "subject": "Chemistry", "chapter": "Atomic Structure"
  },
  {
    "question_text": "In this schematic diagram, what are the compounds?",
    "multiple_choice": ["SO2, H2SO4", "SO3, SO2, H2SO4", "SO2, SO3, H2SO4"],
    "answer": 3,
    "image_index": 1
  },
  {
    "question_text": "garbage entry with a bad answer",
    "multiple_choice": ["only one option"],
    "answer": 1
  }
]
Hope that helps!`

	t.Run("extracts, validates and tags questions", func(t *testing.T) {
		fc := &fakeComplete{response: validJSON}
		// Both images sit on page 1 — the single chunk's page — so they are
		// part of the manifest the model sees.
		images := []DocumentImage{{Index: 0, Page: 1, Path: "/tmp/a.jpg", MIME: "image/jpeg"}, {Index: 1, Page: 1, Path: "/tmp/b.jpg", MIME: "image/jpeg"}}
		questions, err := ParseQuestionsWithAI([]string{"page text"}, images, fc.complete)
		if err != nil {
			t.Fatalf("ParseQuestionsWithAI: %v", err)
		}
		if len(questions) != 2 {
			t.Fatalf("got %d valid questions, want 2 (invalid entry dropped)", len(questions))
		}
		if questions[0].Answer != 2 || questions[0].Subject != "Chemistry" {
			t.Fatalf("q1 = %+v", questions[0].Question)
		}
		if questions[1].ImageIndex != 1 {
			t.Fatalf("q2 image_index = %d, want 1", questions[1].ImageIndex)
		}
		// The prompt must carry the spec, the manifest, the inline image
		// markers and the text.
		if !strings.Contains(fc.prompt, "IMAGE MANIFEST") ||
			!strings.Contains(fc.prompt, "1-based option index") ||
			!strings.Contains(fc.prompt, "![image 1](/tmp/b.jpg)") {
			t.Fatalf("prompt missing spec sections/markers: %.400s", fc.prompt)
		}
	})

	t.Run("out-of-manifest image index is cleared", func(t *testing.T) {
		fc := &fakeComplete{response: `[{"question_text":"q?","multiple_choice":["a","b"],"answer":1,"image_index":9}]`}
		questions, err := ParseQuestionsWithAI([]string{"t"}, nil, fc.complete)
		if err != nil {
			t.Fatalf("ParseQuestionsWithAI: %v", err)
		}
		if questions[0].ImageIndex != 0 {
			t.Fatalf("image_index = %d, want cleared 0", questions[0].ImageIndex)
		}
	})

	t.Run("long documents split into chunks, merge and dedupe", func(t *testing.T) {
		// Two chunks (page 2 text exceeds chunkTargetChars): chunk 1 = page 1,
		// chunk 2 = page 2 (+ backward overlap of page 1). Page 1 holds a question
		// repeated on page 2 (the overlap) and page 2 holds a second one.
		longPage := strings.Repeat("filler text so this page exceeds the chunk target. ", 700)
		pages := []string{
			"1. What does the overlap diagram show?\na. A cell\nb. A bulb\nAnswer: 1",
			longPage + "2. Which particle is neutral?\na. Proton\nb. Neutron\nAnswer: 2",
		}
		seenQ1 := false
		fc := fakeCompleteFunc(func(prompt string, images []DocumentImage) (string, error) {
			if strings.Contains(prompt, "=== Page 1 ===") && !strings.Contains(prompt, "=== Page 2 ===") {
				seenQ1 = true
				return `[{"question_text":"What does the overlap diagram show?","multiple_choice":["A cell","A bulb"],"answer":1}]`, nil
			}
			// Chunk 2 sees the overlap page too and answers both questions.
			return `[{"question_text":"What  does the OVERLAP diagram show? ","multiple_choice":["A cell","A bulb"],"answer":1},
			        {"question_text":"Which particle is neutral?","multiple_choice":["Proton","Neutron"],"answer":2}]`, nil
		})
		questions, err := ParseQuestionsWithAI(pages, nil, fc)
		if err != nil {
			t.Fatalf("ParseQuestionsWithAI: %v", err)
		}
		if !seenQ1 {
			t.Fatal("expected a chunk covering only page 1")
		}
		if len(questions) != 2 {
			t.Fatalf("merged %d questions, want 2 (overlap duplicate deduped)", len(questions))
		}
		if questions[1].Answer != 2 {
			t.Fatalf("q2 = %+v", questions[1].Question)
		}
	})

	t.Run("a failing chunk fails the parse naming the part", func(t *testing.T) {
		longPage := strings.Repeat("filler text so this page exceeds the chunk target. ", 700)
		pages := []string{"1. q?\na. x\nb. y\nAnswer: 1", longPage + "2. q2?\na. x\nb. y\nAnswer: 1"}
		fc := fakeCompleteFunc(func(prompt string, images []DocumentImage) (string, error) {
			if strings.Contains(prompt, "PART 2 of 2") {
				return "", errors.New("provider down")
			}
			return `[{"question_text":"q?","multiple_choice":["x","y"],"answer":1}]`, nil
		})
		_, err := ParseQuestionsWithAI(pages, nil, fc)
		if err == nil || !strings.Contains(err.Error(), "part 2:") || !strings.Contains(err.Error(), "provider down") {
			t.Fatalf("expected part-2 failure, got %v", err)
		}
	})

	t.Run("AI failures and malformed output surface as errors", func(t *testing.T) {
		if _, err := ParseQuestionsWithAI(nil, nil, (&fakeComplete{err: errors.New("provider down")}).complete); err == nil {
			t.Fatal("expected provider error to propagate")
		}
		if _, err := ParseQuestionsWithAI(nil, nil, (&fakeComplete{response: "no json here"}).complete); err == nil {
			t.Fatal("expected missing-JSON error")
		}
		if _, err := ParseQuestionsWithAI(nil, nil, (&fakeComplete{response: `[{"question_text":"","multiple_choice":["a","b"],"answer":1}]`}).complete); err == nil {
			t.Fatal("expected no-valid-questions error")
		}
	})
}

// fakeCompleteFunc adapts a plain function to the complete seam; the named
// type is assignable to the plain func signature ParseQuestionsWithAI takes.
type fakeCompleteFunc func(prompt string, images []DocumentImage) (string, error)

// fakeJPEG is not a decodable image — the extractors treat DCTDecode streams
// as opaque JPEG bytes, so the signature is all that matters for tests. It is
// padded past the scanner's 512-byte false-positive threshold.
var fakeJPEG = append([]byte("\xFF\xD8\xFF\xE0\x00\x10JFIF"), append(make([]byte, 1024), 0xFF, 0xD9)...)

func cleanupImages(t *testing.T, images []DocumentImage) {
	t.Helper()
	if len(images) > 0 {
		os.RemoveAll(filepath.Dir(images[0].Path))
	}
}

// TestExtractDocumentImagesDocx pulls media out of word/media/.
func TestExtractDocumentImagesDocx(t *testing.T) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	mustZipWrite(t, zw, "word/document.xml", []byte(`<w:document xmlns:w="urn:x"><w:body><w:p/></w:body></w:document>`))
	mustZipWrite(t, zw, "word/media/image1.jpg", fakeJPEG)
	mustZipWrite(t, zw, "word/media/notes.txt", []byte("not an image"))
	mustZipWrite(t, zw, "outside/sneaky.jpg", fakeJPEG)
	if err := zw.Close(); err != nil {
		t.Fatalf("zip close: %v", err)
	}

	images, err := ExtractDocumentImages("bank.docx", buf.Bytes())
	if err != nil {
		t.Fatalf("ExtractDocumentImages: %v", err)
	}
	defer cleanupImages(t, images)
	if len(images) != 1 {
		t.Fatalf("got %d images, want 1 (media dir only)", len(images))
	}
	if images[0].MIME != "image/jpeg" || images[0].Page != 0 {
		t.Fatalf("unexpected manifest entry: %+v", images[0])
	}
	if _, err := os.Stat(images[0].Path); err != nil {
		t.Fatalf("temp file missing: %v", err)
	}
}

// TestExtractDocumentImagesPDFDCT builds a single-page PDF embedding a
// DCTDecode image XObject. The lib's Reader() cannot decode DCT, so the JPEG
// is carved out of the raw bytes by the scanner and attributed back to the
// referencing page via the XObject stream length.
func TestExtractDocumentImagesPDFDCT(t *testing.T) {
	pdfBytes := buildTestPDFWithImage([]string{"1. What is shown in the diagram?", "a. A cell", "b. A bulb"})
	images, err := ExtractDocumentImages("exam.pdf", pdfBytes)
	if err != nil {
		t.Fatalf("ExtractDocumentImages: %v", err)
	}
	defer cleanupImages(t, images)
	if len(images) != 1 {
		t.Fatalf("got %d images, want 1", len(images))
	}
	if images[0].MIME != "image/jpeg" || images[0].Page != 1 {
		t.Fatalf("unexpected manifest entry: %+v", images[0])
	}
}

// buildTestPDFWithImage embeds a DCTDecode image XObject. Assembled with byte
// writes so the binary JPEG stream survives verbatim.
func buildTestPDFWithImage(lines []string) []byte {
	return buildTestPDFWithImageStream(lines, "/DCTDecode", fakeJPEG)
}

// buildTestPDFWithImageStream assembles a single-page PDF whose XObject
// /Im0 carries imageData under the given filter.
func buildTestPDFWithImageStream(lines []string, filter string, imageData []byte) []byte {
	var content strings.Builder
	for i, line := range lines {
		fmt.Fprintf(&content, "BT /F1 12 Tf 72 %d Td (%s) Tj ET\n", 750-i*14, line)
	}
	stream := content.String()

	textObjects := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> /XObject << /Im0 6 0 R >> >> /Contents 4 0 R >>",
		fmt.Sprintf("<< /Length %d >>\nstream\n%sendstream", len(stream), stream),
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
	}

	var buf bytes.Buffer
	buf.WriteString("%PDF-1.4\n")
	offsets := make([]int, 6)
	for i, obj := range textObjects {
		offsets[i] = buf.Len()
		fmt.Fprintf(&buf, "%d 0 obj\n%s\nendobj\n", i+1, obj)
	}
	offsets[5] = buf.Len()
	fmt.Fprintf(&buf, "6 0 obj\n<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter %s /Length %d >>\nstream\n", filter, len(imageData))
	buf.Write(imageData)
	buf.WriteString("\nendstream\nendobj\n")
	xrefStart := buf.Len()
	fmt.Fprintf(&buf, "xref\n0 7\n")
	buf.WriteString("0000000000 65535 f \n")
	for _, off := range offsets {
		fmt.Fprintf(&buf, "%010d 00000 n \n", off)
	}
	fmt.Fprintf(&buf, "trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", xrefStart)
	return buf.Bytes()
}

// TestExtractDocumentImagesPDFFlate exercises the XObject walk: a FlateDecode
// DeviceRGB image decodes to raw samples the extractor rebuilds as a PNG,
// with the page number preserved.
func TestExtractDocumentImagesPDFFlate(t *testing.T) {
	pdfBytes := buildTestPDFWithFlateImage([]string{"1. What is shown in the diagram?", "a. A cell", "b. A bulb"})
	images, err := ExtractDocumentImages("exam.pdf", pdfBytes)
	if err != nil {
		t.Fatalf("ExtractDocumentImages: %v", err)
	}
	defer cleanupImages(t, images)
	if len(images) != 1 {
		t.Fatalf("got %d images, want 1", len(images))
	}
	if images[0].MIME != "image/png" || images[0].Page != 1 {
		t.Fatalf("unexpected manifest entry: %+v", images[0])
	}
}

// buildTestPDFWithFlateImage embeds a 2x2 DeviceRGB image via FlateDecode
// (raw samples zlib-compressed), which the lib's Reader() decodes.
func buildTestPDFWithFlateImage(lines []string) []byte {
	samples := []byte{255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0} // 2x2 RGB
	var zbuf bytes.Buffer
	zw := zlib.NewWriter(&zbuf)
	_, _ = zw.Write(samples)
	_ = zw.Close()
	return buildTestPDFWithImageStream(lines, "/FlateDecode", zbuf.Bytes())
}

func mustZipWrite(t *testing.T, zw *zip.Writer, name string, data []byte) {
	t.Helper()
	w, err := zw.Create(name)
	if err != nil {
		t.Fatalf("zip create %s: %v", name, err)
	}
	if _, err := w.Write(data); err != nil {
		t.Fatalf("zip write %s: %v", name, err)
	}
}

// TestExtractDocumentPagesRealESSLCE pins the raw-material layer against the
// real exam: 21 pages of text and the figure images extracted with pages.
func TestExtractDocumentPagesRealESSLCE(t *testing.T) {
	content, err := os.ReadFile(filepath.Join("testdata", "esslce-2018-chemistry.pdf"))
	if err != nil {
		if os.IsNotExist(err) {
			t.Skip("real-exam fixture not present")
		}
		t.Fatalf("read fixture: %v", err)
	}
	pages, err := ExtractDocumentPages("esslce-2018-chemistry.pdf", content)
	if err != nil {
		t.Fatalf("ExtractDocumentPages: %v", err)
	}
	if len(pages) != 21 {
		t.Fatalf("got %d pages, want 21", len(pages))
	}
	images, err := ExtractDocumentImages("esslce-2018-chemistry.pdf", content)
	if err != nil {
		t.Fatalf("ExtractDocumentImages: %v", err)
	}
	defer cleanupImages(t, images)
	t.Logf("extracted %d images from the real exam", len(images))
	if len(images) < 3 {
		t.Fatalf("only %d images extracted from the figure-heavy exam", len(images))
	}
	for i, img := range images {
		if img.Index != i || img.Page < 1 || img.Page > 21 {
			t.Fatalf("bad manifest entry: %+v", img)
		}
	}
}
