package usecase

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ledongthuc/pdf"
	"victory-contest-go/internal/domain"
)

// Document parsing constants. A full exam's JSON (60 questions with
// explanations) is ~10k output tokens, so the parse completion gets its own
// generous timeout and token budget.
const (
	aiDocumentParseTimeout = 180 * time.Second
	documentParseMaxTokens = 16384
	// Vision payload guards: extracted images ride inline as base64.
	maxDocumentImages      = 12
	maxDocumentImageBytes  = 4 << 20  // per image
	maxDocumentImageTotal  = 48 << 20 // per document
)

// DocumentImage is one image extracted from an uploaded document. Index is
// the document order used by the AI's "image_index" tagging, Page the 1-based
// page (0 when the format has no pages, e.g. .txt/.docx), and Path the
// server-side temp file the admin panel can attach to a question later.
type DocumentImage struct {
	Index int    `json:"index"`
	Page  int    `json:"page"`
	Path  string `json:"path"`
	MIME  string `json:"mime"`
}

// ExtractDocumentPages splits the uploaded document into per-page plain text
// (one chunk for formats without pages). This is the raw material the AI
// structures — no format-specific question matching happens here.
func ExtractDocumentPages(filename string, content []byte) ([]string, error) {
	return extractDocumentPages(filename, content)
}

// ExtractDocumentImages pulls the embedded images out of the document into a
// server-side temp directory and returns their manifest. Images are
// best-effort: unsupported encodings are skipped with a log, never fatal.
// The caller owns the temp directory lifetime (no cron deletes it; small).
func ExtractDocumentImages(filename string, content []byte) ([]DocumentImage, error) {
	dir, err := os.MkdirTemp("", "victory-doc-")
	if err != nil {
		return nil, fmt.Errorf("create temp dir: %w", err)
	}
	var images []DocumentImage
	collect := func(data []byte, mime string, page int) bool {
		if len(images) >= maxDocumentImages || int64(len(data)) > maxDocumentImageBytes {
			return false
		}
		total := int64(0)
		for _, img := range images {
			if st, err := os.Stat(img.Path); err == nil {
				total += st.Size()
			}
		}
		if total+int64(len(data)) > maxDocumentImageTotal {
			return false
		}
		name := fmt.Sprintf("p%03d-%02d%s", page, len(images), mimeExtension(mime))
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, data, 0o644); err != nil {
			log.Printf("document images: write %s: %v", path, err)
			return false
		}
		images = append(images, DocumentImage{Index: len(images), Page: page, Path: path, MIME: mime})
		return true
	}

	if bytes.HasPrefix(content, []byte("PK\x03\x04")) || strings.EqualFold(filepath.Ext(filename), ".docx") {
		if err := extractDocxImages(content, collect); err != nil {
			return images, err
		}
		return images, nil
	}
	if bytes.HasPrefix(content, []byte("%PDF")) || strings.EqualFold(filepath.Ext(filename), ".pdf") {
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("document images: pdf walk panicked: %v", r)
				}
			}()
			r, err := pdf.NewReader(bytes.NewReader(content), int64(len(content)))
			if err != nil {
				return
			}
			extractPDFImages(r, content, collect)
		}()
		return images, nil
	}
	// .txt has no images; the empty temp dir stays (harmless).
	return images, nil
}

// imageSink receives one extracted image; returning false stops extraction
// (caps reached).
type imageSink func(data []byte, mime string, page int) bool

func extractDocxImages(content []byte, sink imageSink) error {
	zr, err := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		return fmt.Errorf("not a readable .docx document: %w", err)
	}
	for _, f := range zr.File {
		if !strings.HasPrefix(f.Name, "word/media/") || f.FileInfo().IsDir() {
			continue
		}
		mime := mimeByExtension(filepath.Ext(f.Name))
		if mime == "" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			continue
		}
		data, err := io.ReadAll(io.LimitReader(rc, maxDocumentImageBytes+1))
		rc.Close()
		if err != nil || len(data) == 0 || int64(len(data)) > maxDocumentImageBytes {
			continue
		}
		if !sink(data, mime, 0) {
			return nil
		}
	}
	return nil
}

// extractPDFImages walks every page's XObject resources. FlateDecode-only
// streams decode to raw samples and are rebuilt into PNGs when the colorspace
// is one we understand (DeviceRGB/DeviceGray/ICCBased N=1,3, 8 bpc);
// DCTDecode streams the lib cannot decode, so JPEGs are picked up afterwards
// by scanRawJPEGs. Anything else is skipped.
func extractPDFImages(r *pdf.Reader, content []byte, sink imageSink) {
	for p := 1; p <= r.NumPage(); p++ {
		page := r.Page(p)
		if page.V.IsNull() {
			continue
		}
		xobjs := page.V.Key("Resources").Key("XObject")
		for _, name := range xobjs.Keys() {
			x := xobjs.Key(name)
			if x.Key("Subtype").Name() != "Image" || x.Key("ImageMask").Bool() {
				continue
			}
			data, mime, err := decodePDFImage(x)
			if err != nil {
				log.Printf("document images: page %d xobject %s: %v", p, name, err)
				continue
			}
			if !sink(data, mime, p) {
				return
			}
		}
	}
	// The lib's filter stack panics on DCTDecode ("unknown filter"), which is
	// how photo-bearing PDFs embed JPEGs; recover those straight from the raw
	// file bytes instead (page unknown → 0).
	seen := make(map[string]bool)
	for _, jpeg := range scanRawJPEGs(content) {
		if seen[string(jpeg)] {
			continue
		}
		seen[string(jpeg)] = true
		if !sink(jpeg, "image/jpeg", 0) {
			return
		}
	}
}

// scanRawJPEGs carves complete JPEG files (SOI…EOI) out of raw PDF bytes —
// DCTDecode streams store the JPEG file verbatim between stream/endstream.
// Only plausible-sized hits are kept to dodge stray marker pairs.
func scanRawJPEGs(content []byte) [][]byte {
	var out [][]byte
	const minJPEG = 512
	for i := 0; i+3 < len(content); {
		start := bytes.Index(content[i:], []byte("\xFF\xD8\xFF"))
		if start < 0 {
			break
		}
		start += i
		rel := bytes.Index(content[start+2:], []byte("\xFF\xD9"))
		if rel < 0 {
			break
		}
		end := start + 2 + rel + 2
		if end-start >= minJPEG {
			out = append(out, content[start:end])
		}
		i = end
	}
	return out
}

// decodePDFImage returns the image bytes (JPEG/PNG) for an image XObject.
// Reader() applies the PDF filters itself, so the per-image recover turns its
// panics on exotic filters (e.g. DCTDecode) into ordinary skips.
func decodePDFImage(x pdf.Value) (data []byte, mime string, err error) {
	defer func() {
		if r := recover(); r != nil {
			data, mime, err = nil, "", fmt.Errorf("image stream undecodable: %v", r)
		}
	}()
	w := x.Key("Width").Int64()
	h := x.Key("Height").Int64()
	if w <= 0 || h <= 0 || w*h > 64_000_000 {
		return nil, "", fmt.Errorf("unsupported dimensions %dx%d", w, h)
	}
	rc := x.Reader()
	defer rc.Close()
	data, err = io.ReadAll(io.LimitReader(rc, maxDocumentImageBytes+1))
	if err != nil {
		return nil, "", err
	}
	if int64(len(data)) > maxDocumentImageBytes {
		return nil, "", errors.New("image stream too large")
	}
	if len(data) == 0 {
		return nil, "", errors.New("empty image stream")
	}
	// DCTDecode passes JPEG bytes through; a PNG byte signature would mean a
	// producer already stored PNG data (rare, take it as-is).
	if bytes.HasPrefix(data, []byte("\xFF\xD8")) {
		return data, "image/jpeg", nil
	}
	if bytes.HasPrefix(data, []byte("\x89PNG")) {
		return data, "image/png", nil
	}
	// The filters fully decoded to raw samples — rebuild a PNG when the
	// colorspace is one we understand.
	components := int64(0)
	cs := x.Key("ColorSpace")
	switch cs.Kind() {
	case pdf.Name:
		switch cs.Name() {
		case "DeviceRGB":
			components = 3
		case "DeviceGray":
			components = 1
		}
	case pdf.Array:
		if cs.Len() > 0 && cs.Index(0).Name() == "ICCBased" && cs.Index(1).Kind() == pdf.Stream {
			components = cs.Index(1).Key("N").Int64()
		}
	}
	if components != 1 && components != 3 {
		return nil, "", errors.New("unsupported colorspace")
	}
	if x.Key("BitsPerComponent").Int64() != 8 {
		return nil, "", errors.New("unsupported bit depth")
	}
	stride := int(w) * int(components)
	if len(data) < stride*int(h) {
		return nil, "", errors.New("truncated image data")
	}
	img := image.NewRGBA(image.Rect(0, 0, int(w), int(h)))
	for y := 0; y < int(h); y++ {
		row := data[y*stride : (y+1)*stride]
		for xi := 0; xi < int(w); xi++ {
			if components == 3 {
				img.SetRGBA(xi, y, color.RGBA{row[xi*3], row[xi*3+1], row[xi*3+2], 255})
			} else {
				v := row[xi]
				img.SetRGBA(xi, y, color.RGBA{v, v, v, 255})
			}
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, "", err
	}
	return buf.Bytes(), "image/png", nil
}

func mimeByExtension(ext string) string {
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".bmp":
		return "image/bmp"
	default:
		return ""
	}
}

func mimeExtension(mime string) string {
	switch mime {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "image/bmp":
		return ".bmp"
	default:
		return ".bin"
	}
}

// encodeImageFileB64 reads a temp image and returns its base64 payload for
// the provider's inline vision parts.
func encodeImageFileB64(path string, capBytes int64) (string, error) {
	st, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if st.Size() > capBytes {
		return "", fmt.Errorf("image %s exceeds %d bytes", filepath.Base(path), capBytes)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

// aiParsedQuestion is one AI-proposed question: the stored shape plus the
// optional tag pointing at an extracted document image.
type aiParsedQuestion struct {
	domain.Question
	ImageIndex int `json:"image_index,omitempty"`
}

// documentParseSpec tells the model exactly what the backend needs. The
// format rules mirror domain.Question and the 1-based answer convention the
// grader relies on.
const documentParseSpec = `You are a question-bank structuring assistant. The input is raw text extracted from a quiz/exam document (page by page), plus a manifest of images embedded in that document (also attached inline when this model supports images).

Reconstruct EVERY multiple-choice question in the document. Account for:
- Questions numbered "1.", "Q1.", "16 " (the dot is sometimes missing) or similar.
- Options listed as "a.", "A.", "a)", often wrapped across several lines.
- A trailing answer key ("1. Answer: C"): letter answers map to option positions a=1, b=2, c=3, d=4; attach the key's "Explanation:" text to the matching question.
- Page headers, footers and ads repeated on every page: drop them, never let them into question text.
- Superscripts/subscripts extracted as separate fragments ("1s2", "2p6") and split words: join them back into sensible text.
- Formula-heavy lines may be missing from the extracted text; leave such questions' explanation empty rather than inventing content.

Return ONLY a JSON array — no prose, no markdown fences. One object per question:
{
  "question_text": "the full question text",
  "multiple_choice": ["first option", "second option"],
  "answer": 3,
  "explanation": "explanation from the document, or \"\"",
  "grade": "", "subject": "", "chapter": "",
  "image_index": 2
}
"multiple_choice" keeps the original option order (2+ entries). "answer" is the 1-based option index. "grade"/"subject"/"chapter" come from header lines like Subject:/Grade:/Chapter: when present, otherwise "". "image_index" is included ONLY when the question clearly belongs to one of the manifest images (it references a diagram/figure, or sits directly beside it on the page); otherwise omit the field.

Rules: never invent questions, options or answers; preserve the original wording (fix only extraction artifacts); if the document shows 60 questions, output 60; every question MUST have at least 2 options and an answer between 1 and the option count.`

// buildDocumentParsePrompt assembles the spec, the image manifest and the
// page-marked text into one prompt.
func buildDocumentParsePrompt(pages []string, images []DocumentImage) string {
	var b strings.Builder
	b.WriteString(documentParseSpec)
	b.WriteString("\n\n=== IMAGE MANIFEST ===\n")
	if len(images) == 0 {
		b.WriteString("(no images were extracted from the document)\n")
	} else {
		for _, img := range images {
			fmt.Fprintf(&b, "image_index=%d (page %d)\n", img.Index, img.Page)
		}
	}
	b.WriteString("\n=== DOCUMENT TEXT ===\n")
	if len(pages) > 1 {
		for i, p := range pages {
			fmt.Fprintf(&b, "=== Page %d ===\n%s\n", i+1, p)
		}
	} else {
		b.WriteString(strings.TrimSpace(strings.Join(pages, "\n")))
		b.WriteString("\n")
	}
	return b.String()
}

// ParseQuestionsWithAI sends the extracted document text (and images, via
// complete) to the configured AI provider and validates whatever comes back
// into review-ready questions. Invalid entries are dropped; an empty valid
// set is an error, never a garbage list.
func ParseQuestionsWithAI(pages []string, images []DocumentImage, complete func(prompt string, images []DocumentImage) (string, error)) ([]aiParsedQuestion, error) {
	raw, err := complete(buildDocumentParsePrompt(pages, images), images)
	if err != nil {
		return nil, err
	}
	start := strings.Index(raw, "[")
	end := strings.LastIndex(raw, "]")
	if start == -1 || end == -1 || start > end {
		return nil, errors.New("could not find a valid JSON array in the AI response")
	}
	var parsed []aiParsedQuestion
	if err := json.Unmarshal([]byte(raw[start:end+1]), &parsed); err != nil {
		return nil, fmt.Errorf("parse AI question JSON: %w", err)
	}
	valid := make([]aiParsedQuestion, 0, len(parsed))
	for i := range parsed {
		p := parsed[i]
		p.QuestionText = strings.TrimSpace(p.QuestionText)
		if p.QuestionText == "" || len(p.MultipleChoice) < 2 {
			continue
		}
		if p.Answer < 1 || p.Answer > len(p.MultipleChoice) {
			continue
		}
		if p.ImageIndex < 0 || p.ImageIndex >= len(images) {
			p.ImageIndex = 0
		}
		valid = append(valid, p)
	}
	if len(valid) == 0 {
		return nil, errors.New("the AI response contained no valid questions")
	}
	return valid, nil
}
