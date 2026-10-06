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
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/ledongthuc/pdf"
	"victory-contest-go/internal/domain"
)

// Document parsing constants. Documents that fit in one request go in a
// single AI call (one request cannot trip per-minute request quotas the way
// a chunk wave does); oversized documents fall back to page-group chunks.
const (
	documentParseMaxTokens = 16384 // reasoning models spend thousands of tokens before any content
	// Vision payload guards: extracted images ride inline as base64.
	maxDocumentImages     = 12
	maxDocumentImageBytes = 4 << 20  // per image
	maxDocumentImageTotal = 48 << 20 // per document

	singleCallMaxChars = 30_000           // ~8k input tokens: whole document in one request below this
	chunkTargetChars   = 6_000            // page text per AI call — smaller calls finish faster
	chunkOverlapPages  = 1                // boundary pages repeated so cross-page questions survive
	chunkMaxAttempts   = 3                // rate-limited providers need patience, not failure
	chunkConcurrency   = 1                // strict-quota providers (GLM flash tier) allow ~1 inflight
	chunkRetryBackoff  = 5 * time.Second  // plain failure backoff
	chunk429Backoff    = 30 * time.Second // rate-limit recovery window
)

// documentParseMaxTokensBudget is the generation budget per chunk. Reasoning
// models spend a large invisible budget before content, so the default is
// generous; AI_DOCUMENT_MAX_TOKENS overrides it downward for cheaper models.
func documentParseMaxTokensBudget() int {
	if v := os.Getenv("AI_DOCUMENT_MAX_TOKENS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 256 {
			return n
		}
		log.Printf("AI_DOCUMENT_MAX_TOKENS=%q is invalid (min 256) — using the 16384 default", v)
	}
	return documentParseMaxTokens
}

// documentParseTimeout is the per-call budget for one document chunk. Slow
// providers (reasoning models, distant proxies) can exceed the 180s default;
// AI_DOCUMENT_TIMEOUT_SECONDS raises it without a redeploy code change.
func documentParseTimeout() time.Duration {
	if v := os.Getenv("AI_DOCUMENT_TIMEOUT_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 30 {
			return time.Duration(n) * time.Second
		}
		log.Printf("AI_DOCUMENT_TIMEOUT_SECONDS=%q is invalid (min 30) — using the 180s default", v)
	}
	return 180 * time.Second
}

// DocumentImage is one image extracted from an uploaded document. Index is
// the document order used by the AI's "image_index" tagging, Page the 1-based
// page (0 when the format has no pages or the page could not be determined),
// and Path the server-side temp file the admin panel can attach to a
// question later.
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
	var collected []parsedImage
	add := func(data []byte, mime string, page int) bool {
		if len(collected) >= maxDocumentImages || int64(len(data)) > maxDocumentImageBytes {
			return false
		}
		total := int64(0)
		for _, img := range collected {
			total += int64(len(img.data))
		}
		if total+int64(len(data)) > maxDocumentImageTotal {
			return false
		}
		collected = append(collected, parsedImage{data: data, mime: mime, page: page})
		return true
	}

	if bytes.HasPrefix(content, []byte("PK\x03\x04")) || strings.EqualFold(filepath.Ext(filename), ".docx") {
		if err := extractDocxImages(content, add); err != nil {
			return nil, err
		}
	} else if bytes.HasPrefix(content, []byte("%PDF")) || strings.EqualFold(filepath.Ext(filename), ".pdf") {
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
			extractPDFImages(r, content, add)
		}()
	}
	// .txt has no images; the empty temp dir stays (harmless).

	// Stable document order: pages ascending, pageless images last.
	sort.SliceStable(collected, func(i, j int) bool {
		if (collected[i].page == 0) != (collected[j].page == 0) {
			return collected[j].page == 0
		}
		return collected[i].page < collected[j].page
	})

	images := make([]DocumentImage, 0, len(collected))
	for _, img := range collected {
		name := fmt.Sprintf("p%03d-%02d%s", img.page, len(images), mimeExtension(img.mime))
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, img.data, 0o644); err != nil {
			log.Printf("document images: write %s: %v", path, err)
			continue
		}
		images = append(images, DocumentImage{Index: len(images), Page: img.page, Path: path, MIME: img.mime})
	}
	return images, nil
}

type parsedImage struct {
	data []byte
	mime string
	page int
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

// extractPDFImages walks every page's image XObjects. FlateDecode-only
// streams decode to raw samples and are rebuilt into PNGs when the colorspace
// is one we understand (DeviceRGB/DeviceGray/ICCBased N=1,3, 8 bpc).
// DCTDecode streams the lib cannot decode, so their JPEG bytes are carved
// from the raw file by the scanner and attributed back to the referencing
// page via the stream length. Anything else is skipped.
func extractPDFImages(r *pdf.Reader, content []byte, sink imageSink) {
	type dctRef struct {
		page   int
		length int64
	}
	var dctRefs []dctRef

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
			filters := imageFilters(x)
			hasDCT := false
			for _, f := range filters {
				if f == "DCTDecode" {
					hasDCT = true
					break
				}
			}
			if hasDCT {
				// The lib's filter stack panics on DCTDecode; the bytes are
				// carved from the raw file below and matched by length.
				dctRefs = append(dctRefs, dctRef{page: p, length: x.Key("Length").Int64()})
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

	if len(dctRefs) == 0 {
		return
	}
	carves := scanRawJPEGs(content)
	used := make([]bool, len(carves))
	for _, ref := range dctRefs {
		if ref.length <= 0 {
			continue
		}
		for i, jpeg := range carves {
			if !used[i] && int64(len(jpeg)) == ref.length {
				used[i] = true
				if !sink(jpeg, "image/jpeg", ref.page) {
					return
				}
				break
			}
		}
	}
	// Carves no XObject claimed (page unknown): keep them, page 0, in
	// document order.
	for i, jpeg := range carves {
		if !used[i] && !sink(jpeg, "image/jpeg", 0) {
			return
		}
	}
}

// imageFilters lists the stream's filter names ("DCTDecode", "FlateDecode", …).
func imageFilters(x pdf.Value) []string {
	f := x.Key("Filter")
	switch f.Kind() {
	case pdf.Name:
		return []string{f.Name()}
	case pdf.Array:
		var out []string
		for i := 0; i < f.Len(); i++ {
			out = append(out, f.Index(i).Name())
		}
		return out
	default:
		return nil
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
// panics on exotic filters into ordinary skips.
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
// document question number (so a trailing answer key can be merged on) and
// the optional tag pointing at an extracted document image.
type aiParsedQuestion struct {
	domain.Question
	Number     int `json:"number,omitempty"`
	ImageIndex int `json:"image_index,omitempty"`
}

// keyEntry is one answer-key line ("12. Answer: D" + Explanation) the model
// reports separately from the questions.
type keyEntry struct {
	Number      int    `json:"number"`
	Answer      string `json:"answer"`
	Explanation string `json:"explanation"`
}

// chunkResponse is the per-chunk model contract. A bare question array is
// still accepted for older prompts and test fakes.
type chunkResponse struct {
	Questions []aiParsedQuestion `json:"questions"`
	AnswerKey []keyEntry         `json:"answer_key"`
}

// documentParseSpec tells the model exactly what the backend needs. The
// format rules mirror domain.Question and the 1-based answer convention the
// grader relies on.
const documentParseSpec = `You are a question-bank structuring assistant. You receive a PART of the raw text extracted from a quiz/exam document (page by page), plus the manifest of images embedded in that part (also attached inline when this model supports images).

Reconstruct EVERY multiple-choice question fully contained in this part. Account for:
- Questions numbered "1.", "Q1.", "16 " (the dot is sometimes missing) or similar.
- Options listed as "a.", "A.", "a)", often wrapped across several lines.
- A trailing answer key ("1. Answer: C"): letter answers map to option positions a=1, b=2, c=3, d=4; attach the key's "Explanation:" text to the matching question.
- Page headers, footers and ads repeated on every page: drop them, never let them into question text.
- Superscripts/subscripts extracted as separate fragments ("1s2", "2p6") and split words: join them back into sensible text.
- Formula-heavy content may appear as images: read the attached images and transcribe what you need (e.g. to complete an explanation) rather than leaving it out.
- Image locations appear inline in the text as markdown markers like ![image 3](/path/to/file.jpg) exactly where the image sits on the page; the path is informational — when a question needs that image, tag it with "image_index": 3.

Return ONLY a JSON object — no prose, no markdown fences:
{
  "questions": [
    {
      "number": 1,
      "question_text": "the full question text",
      "multiple_choice": ["first option", "second option"],
      "answer": 3,
      "explanation": "explanation stated next to the question, or empty when unknown here",
      "grade": "", "subject": "", "chapter": "",
      "image_index": 2
    }
  ],
  "answer_key": [
    { "number": 12, "answer": "D", "explanation": "the key's explanation text" }
  ]
}
"questions.number" is the question's number in the document (required — the answer key is matched by it). "multiple_choice" keeps the original option order (2+ entries). "answer" is the 1-based option index when THIS part shows the answer (inline or via the key); use 0 when the answer lives in another part. "answer_key" lists every "N. Answer: X" entry found in this part with its "Explanation:" text, even when the questions themselves are in another part (letter positions a=1..d=4 are resolved server-side). "grade"/"subject"/"chapter" come from header lines like Subject:/Grade:/Chapter: when present, otherwise "". "image_index" is included ONLY when the question clearly belongs to one of the manifest images (it references a diagram/figure, or sits directly beside it on the page); otherwise omit the field.

Rules: never invent questions, options or answers; preserve the original wording (fix only extraction artifacts); omit a question whose options are cut off at this part's boundaries — it is handled by the adjacent part; every question MUST have at least 2 options.`

// buildChunkPrompt assembles the spec, the chunk's image manifest, its
// page-marked text — with each image's markdown marker inserted at its page
// location — into one prompt.
func buildChunkPrompt(part, total int, pages []string, firstPageNo int, images []DocumentImage) string {
	var b strings.Builder
	b.WriteString(documentParseSpec)
	fmt.Fprintf(&b, "\n\nThis is PART %d of %d of the document; pages below are numbered as in the full document.\n", part, total)
	b.WriteString("\n=== IMAGE MANIFEST (this part) ===\n")
	if len(images) == 0 {
		b.WriteString("(no images were extracted for this part)\n")
	} else {
		for _, img := range images {
			fmt.Fprintf(&b, "image_index=%d (page %d)\n", img.Index, img.Page)
		}
	}
	b.WriteString("\n=== DOCUMENT TEXT (this part) ===\n")
	for i, p := range pages {
		pageNo := firstPageNo + i
		fmt.Fprintf(&b, "=== Page %d ===\n", pageNo)
		// The image markers sit inline at their page location so the model
		// sees exactly where each figure belongs.
		for _, img := range images {
			if img.Page == pageNo {
				fmt.Fprintf(&b, "![image %d](%s)\n", img.Index, img.Path)
			}
		}
		b.WriteString(p)
		b.WriteString("\n")
	}
	return b.String()
}

// splitPageRanges groups page indexes into consecutive chunks of roughly
// chunkTargetChars, returning inclusive [from,to] ranges.
func splitPageRanges(pages []string) [][2]int {
	var ranges [][2]int
	from, chars := 0, 0
	for i, p := range pages {
		if chars > 0 && chars+len(p) > chunkTargetChars {
			ranges = append(ranges, [2]int{from, i - 1})
			from, chars = i, 0
		}
		chars += len(p)
	}
	return append(ranges, [2]int{from, len(pages) - 1})
}

// chunkImages selects the images belonging to pages [from,to] (1-based page
// numbers); pageless images ride along with the first chunk.
func chunkImages(images []DocumentImage, from, to int) []DocumentImage {
	var out []DocumentImage
	for _, img := range images {
		switch {
		case img.Page >= from+1 && img.Page <= to+1:
			out = append(out, img)
		case img.Page == 0 && from == 0:
			out = append(out, img)
		}
	}
	return out
}

// ParseQuestionsWithAI structures the extracted document with the configured
// AI provider: the document is split into page-group chunks, each chunk is
// completed (with retries) against the provider — images of that chunk ride
// inline — and the per-chunk results are merged: questions dedupe (the
// one-page overlap between chunks makes boundary questions surface whole in
// at least one chunk) and answer-key entries attach to their questions by
// number, so a key printed after the questions still wins. Any chunk that
// still fails fails the parse naming the part and the reason; an empty valid
// set is an error, never garbage.
func ParseQuestionsWithAI(pages []string, images []DocumentImage, complete func(prompt string, images []DocumentImage) (string, error)) ([]aiParsedQuestion, error) {
	if len(pages) == 0 {
		pages = []string{""}
	}
	// A document that fits in one call goes in ONE request: typical exams are
	// ~8k input tokens and 131k-context models take the whole thing easily,
	// and one request cannot trip per-minute request quotas the way a chunk
	// wave does. Chunking stays for oversized documents only.
	totalChars := 0
	for _, p := range pages {
		totalChars += len(p)
	}
	if totalChars <= singleCallMaxChars {
		log.Printf("ai document parse: single-call path (%d pages, %d chars, %d images)", len(pages), totalChars, len(images))
		qs, key, err := runChunkWithRetry(1, 1, pages, 1, images, complete)
		if err != nil {
			return nil, err
		}
		merged := finalizeQuestions(qs, key)
		if len(merged) == 0 {
			return nil, errors.New("the AI response contained no valid questions (none had a resolvable answer)")
		}
		return merged, nil
	}
	ranges := splitPageRanges(pages)
	type chunkResult struct {
		questions []aiParsedQuestion
		key       []keyEntry
		err       error
	}
	results := make([]chunkResult, len(ranges))
	sem := make(chan struct{}, chunkConcurrency)
	var wg sync.WaitGroup
	for i, r := range ranges {
		wg.Add(1)
		go func(i, from, to int) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			// One overlap page before the chunk lets questions that span the
			// boundary appear whole here; dedupe removes the repeats.
			overlapFrom := from
			if overlapFrom > chunkOverlapPages {
				overlapFrom -= chunkOverlapPages
			} else {
				overlapFrom = 0
			}
			chunkPages := pages[overlapFrom : to+1]
			chunkImgs := chunkImages(images, from, to)
			chunkChars := 0
			for _, p := range chunkPages {
				chunkChars += len(p)
			}
			log.Printf("ai document parse: part %d/%d = pages %d-%d (%d chars, %d images)", i+1, len(ranges), overlapFrom+1, to+1, chunkChars, len(chunkImgs))
			start := time.Now()
			qs, key, err := runChunkWithRetry(i+1, len(ranges), chunkPages, overlapFrom+1, chunkImgs, complete)
			if err != nil {
				log.Printf("ai document parse: part %d/%d FAILED after %s: %v", i+1, len(ranges), time.Since(start).Round(time.Millisecond), err)
			} else {
				log.Printf("ai document parse: part %d/%d done in %s (%d questions, %d key entries)", i+1, len(ranges), time.Since(start).Round(time.Millisecond), len(qs), len(key))
			}
			results[i] = chunkResult{questions: qs, key: key, err: err}
		}(i, r[0], r[1])
	}
	wg.Wait()

	var (
		merged     []aiParsedQuestion
		seen       = map[string]bool{}
		details    []string
		keyAnswers = map[int]string{} // question number → key letter
		keyExpl    = map[int]string{} // question number → key explanation
	)
	for i := range ranges {
		if results[i].err != nil {
			msg := results[i].err.Error()
			if len(msg) > 240 {
				msg = msg[:240] + "…"
			}
			details = append(details, fmt.Sprintf("part %d: %s", i+1, msg))
			continue
		}
		for _, k := range results[i].key {
			if _, ok := keyAnswers[k.Number]; !ok && k.Number > 0 && k.Answer != "" {
				keyAnswers[k.Number] = k.Answer
				keyExpl[k.Number] = k.Explanation
			}
		}
		for _, q := range results[i].questions {
			key := normalizeQuestionKey(q.QuestionText)
			if seen[key] {
				continue
			}
			seen[key] = true
			merged = append(merged, q)
		}
	}
	if len(details) > 0 {
		return nil, fmt.Errorf("AI parsing failed — %s — retry, or switch to mode=text", strings.Join(details, " | "))
	}

	// Attach the answer key (letters a=1..d=4) and its explanations.
	for i := range merged {
		q := &merged[i]
		if q.Answer == 0 {
			if letter, ok := keyAnswers[q.Number]; ok {
				q.Answer = letterOptionIndex(letter)
			}
		}
		if strings.TrimSpace(q.Explanation) == "" {
			if expl, ok := keyExpl[q.Number]; ok {
				q.Explanation = expl
			}
		}
	}
	// The answer range is only enforceable now, after the key had its chance.
	final := finalizeQuestions(merged, nil)
	if len(final) == 0 {
		return nil, errors.New("the AI response contained no valid questions (none had a resolvable answer)")
	}
	return final, nil
}

// finalizeQuestions applies answer-key answers/explanations (when the caller
// has not already merged them) and drops questions whose answer never
// resolved to a valid option index.
func finalizeQuestions(questions []aiParsedQuestion, key []keyEntry) []aiParsedQuestion {
	keyAnswers := map[int]string{}
	keyExpl := map[int]string{}
	for _, k := range key {
		if _, ok := keyAnswers[k.Number]; !ok && k.Number > 0 && k.Answer != "" {
			keyAnswers[k.Number] = k.Answer
			keyExpl[k.Number] = k.Explanation
		}
	}
	final := make([]aiParsedQuestion, 0, len(questions))
	for _, q := range questions {
		if q.Answer == 0 {
			if letter, ok := keyAnswers[q.Number]; ok {
				q.Answer = letterOptionIndex(letter)
			}
		}
		if strings.TrimSpace(q.Explanation) == "" {
			if expl, ok := keyExpl[q.Number]; ok {
				q.Explanation = expl
			}
		}
		if q.Answer >= 1 && q.Answer <= len(q.MultipleChoice) {
			final = append(final, q)
		}
	}
	return final
}

// runChunkWithRetry completes one chunk, retrying once on provider or parse
// failures (transient truncation and rate limits are the common cases).
// Later attempts drop the inline images: some providers hang indefinitely on
// vision parts (observed in production), and a text-only retry still yields
// the questions.
func runChunkWithRetry(part, total int, chunkPages []string, firstPageNo int, images []DocumentImage, complete func(string, []DocumentImage) (string, error)) ([]aiParsedQuestion, []keyEntry, error) {
	prompt := buildChunkPrompt(part, total, chunkPages, firstPageNo, images)
	validIndexes := make(map[int]bool, len(images))
	for _, img := range images {
		validIndexes[img.Index] = true
	}
	var lastErr error
	lastWasRateLimit := false
	for attempt := 1; attempt <= chunkMaxAttempts; attempt++ {
		if attempt > 1 {
			if lastWasRateLimit {
				log.Printf("ai document parse: part %d/%d rate limited — waiting %s before retry", part, total, chunk429Backoff)
				time.Sleep(chunk429Backoff)
			} else {
				time.Sleep(chunkRetryBackoff)
			}
		}
		attemptImages := images
		if attempt > 1 {
			attemptImages = nil
		}
		attemptStart := time.Now()
		raw, err := complete(prompt, attemptImages)
		if err != nil {
			lastWasRateLimit = isRateLimitError(err)
			log.Printf("ai document parse: part %d/%d attempt %d failed after %s: %v", part, total, attempt, time.Since(attemptStart).Round(time.Millisecond), err)
			lastErr = err
			continue
		}
		qs, key, perr := parseChunkResponse(raw, validIndexes)
		if perr == nil {
			if len(qs) == 0 && len(key) == 0 {
				lastErr = errors.New("the AI response contained no questions and no answer-key entries")
				log.Printf("ai document parse: part %d/%d attempt %d unusable after %s (%d chars back): %v", part, total, attempt, time.Since(attemptStart).Round(time.Millisecond), len(raw), lastErr)
				continue
			}
			return qs, key, nil
		}
		lastWasRateLimit = isRateLimitError(perr)
		log.Printf("ai document parse: part %d/%d attempt %d returned unusable output after %s (%d chars back): %v", part, total, attempt, time.Since(attemptStart).Round(time.Millisecond), len(raw), perr)
		lastErr = perr
	}
	return nil, nil, fmt.Errorf("part %d/%d: %w", part, total, lastErr)
}

// isRateLimitError reports whether err is the provider's 429 family (the
// friendly mapping from providerHTTPError or an explicit code).
func isRateLimitError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "rate limit") || strings.Contains(msg, "429")
}

// parseChunkResponse slices the model's reply and validates it. The object
// form carries questions + answer-key entries; a bare question array is
// still accepted. Per-question validation here only checks shape (text,
// options, image tag) — answers may legitimately arrive from another part's
// key and are resolved during the merge.
func parseChunkResponse(raw string, validIndexes map[int]bool) ([]aiParsedQuestion, []keyEntry, error) {
	start := strings.Index(raw, "{")
	end := strings.LastIndex(raw, "}")
	if start != -1 && end > start {
		var obj chunkResponse
		if err := json.Unmarshal([]byte(raw[start:end+1]), &obj); err == nil &&
			(len(obj.Questions) > 0 || len(obj.AnswerKey) > 0) {
			return validateChunkQuestions(obj.Questions, validIndexes), obj.AnswerKey, nil
		}
	}
	qs, err := parseAIQuestions(raw, validIndexes)
	return qs, nil, err
}

// parseAIQuestions accepts the bare question-array reply shape.
func parseAIQuestions(raw string, validIndexes map[int]bool) ([]aiParsedQuestion, error) {
	start := strings.Index(raw, "[")
	end := strings.LastIndex(raw, "]")
	if start == -1 || end == -1 || start > end {
		return nil, errors.New("could not find a valid JSON array in the AI response")
	}
	var parsed []aiParsedQuestion
	if err := json.Unmarshal([]byte(raw[start:end+1]), &parsed); err != nil {
		return nil, fmt.Errorf("parse AI question JSON: %w", err)
	}
	qs := validateChunkQuestions(parsed, validIndexes)
	if len(qs) == 0 {
		return nil, errors.New("the AI response contained no valid questions")
	}
	return qs, nil
}

// validateChunkQuestions keeps entries with text and 2+ options and clears
// image tags that don't point at one of this chunk's manifest images (the
// manifest uses global document indices). Answers are NOT range-checked here
// — they may arrive from another part's answer key.
func validateChunkQuestions(parsed []aiParsedQuestion, validIndexes map[int]bool) []aiParsedQuestion {
	valid := make([]aiParsedQuestion, 0, len(parsed))
	for i := range parsed {
		p := parsed[i]
		p.QuestionText = strings.TrimSpace(p.QuestionText)
		if p.QuestionText == "" || len(p.MultipleChoice) < 2 {
			continue
		}
		if p.ImageIndex != 0 && !validIndexes[p.ImageIndex] {
			p.ImageIndex = 0
		}
		valid = append(valid, p)
	}
	return valid
}

// normalizeQuestionKey is the merge-dedupe key: case- and whitespace-folded
// question text.
func normalizeQuestionKey(text string) string {
	return strings.Join(strings.Fields(strings.ToLower(text)), " ")
}
