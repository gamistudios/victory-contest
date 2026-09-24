package http

import (
	"bytes"
	"errors"
	"mime/multipart"
	"net/http"
	"strings"
	"testing"
	"time"
	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"
)

func pngFileHeader(t *testing.T) *multipart.FileHeader {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	fw, err := w.CreateFormFile("img", "x.png")
	if err != nil {
		t.Fatal(err)
	}
	// Minimal valid PNG signature + IHDR is enough for content sniffing.
	if _, err := fw.Write([]byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0xD}); err != nil {
		t.Fatal(err)
	}
	w.Close()
	req, err := http.NewRequest("POST", "/", bytes.NewReader(buf.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", w.FormDataContentType())
	if err := req.ParseMultipartForm(32 << 20); err != nil {
		t.Fatal(err)
	}
	form := req.MultipartForm
	if form == nil {
		t.Fatal("no multipart form parsed")
	}
	return form.File["img"][0]
}

func TestValidateImageUpload_PngAccepted(t *testing.T) {
	if err := validateImageUpload(pngFileHeader(t)); err != nil {
		t.Fatalf("valid png rejected: %v", err)
	}
}

func TestValidateImageUpload_NonImageRejected(t *testing.T) {
	// Content sniffing must reject text masquerading as a .png.
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	fw, _ := w.CreateFormFile("img", "evil.png")
	fw.Write([]byte("MZ\x90\x00 not really an image, just text bytes"))
	w.Close()
	req, _ := http.NewRequest("POST", "/", bytes.NewReader(buf.Bytes()))
	req.Header.Set("Content-Type", w.FormDataContentType())
	if err := req.ParseMultipartForm(32 << 20); err != nil {
		t.Fatal(err)
	}
	form := req.MultipartForm
	if form == nil {
		t.Fatal("no multipart form parsed")
	}
	err := validateImageUpload(form.File["img"][0])
	if err == nil {
		t.Fatal("text masquerading as png accepted")
	}
	if !errors.Is(err, ErrUploadRejected) {
		t.Fatalf("error %v does not wrap ErrUploadRejected", err)
	}
}

func TestValidateImageUpload_OversizeRejected(t *testing.T) {
	header := pngFileHeader(t)
	header.Size = maxUploadBytes + 1
	err := validateImageUpload(header)
	if err == nil || !errors.Is(err, ErrUploadRejected) {
		t.Fatalf("oversize upload: got %v, want ErrUploadRejected", err)
	}
	if !strings.Contains(err.Error(), "limit") {
		t.Fatalf("oversize error should mention the limit: %v", err)
	}
}

func TestUploadStatus_Mapping(t *testing.T) {
	if got := uploadStatus(ErrUploadRejected); got != http.StatusBadRequest {
		t.Fatalf("ErrUploadRejected -> %d, want 400", got)
	}
	if got := uploadStatus(errors.New("cloudinary down")); got != http.StatusInternalServerError {
		t.Fatalf("other error -> %d, want 500", got)
	}
}

func TestValidateQuestion(t *testing.T) {
	ok := domain.Question{MultipleChoice: []string{"a", "b", "c"}, Answer: 3}
	if err := usecase.ValidateQuestion(ok); err != nil {
		t.Fatalf("valid question rejected: %v", err)
	}
	cases := []struct {
		name string
		q    domain.Question
	}{
		{"answer above range", domain.Question{MultipleChoice: []string{"a", "b"}, Answer: 3}},
		{"answer zero", domain.Question{MultipleChoice: []string{"a", "b"}, Answer: 0}},
		{"answer negative", domain.Question{MultipleChoice: []string{"a", "b"}, Answer: -1}},
		{"single option", domain.Question{MultipleChoice: []string{"a"}, Answer: 1}},
		{"no options", domain.Question{Answer: 1}},
	}
	for _, tc := range cases {
		if err := usecase.ValidateQuestion(tc.q); !errors.Is(err, usecase.ErrInvalidQuestion) {
			t.Fatalf("%s: got %v, want ErrInvalidQuestion", tc.name, err)
		}
	}
}

func TestValidateContestTimes(t *testing.T) {
	valid := time.Date(2026, 9, 24, 12, 0, 0, 0, time.UTC)
	later := valid.Add(2 * time.Hour)
	if err := usecase.ValidateContestTimes(valid.Format(time.RFC3339), later.Format(time.RFC3339)); err != nil {
		t.Fatalf("ordered pair rejected: %v", err)
	}
	if err := usecase.ValidateContestTimes("", ""); err != nil {
		t.Fatalf("empty times must be allowed (create may omit them): %v", err)
	}
	cases := []struct {
		name  string
		start string
		end   string
	}{
		{"garbage start", "tomorrow-ish", later.Format(time.RFC3339)},
		{"garbage end", valid.Format(time.RFC3339), "13/09/2026"},
		{"end before start", later.Format(time.RFC3339), valid.Format(time.RFC3339)},
		{"end equals start", valid.Format(time.RFC3339), valid.Format(time.RFC3339)},
	}
	for _, tc := range cases {
		if err := usecase.ValidateContestTimes(tc.start, tc.end); !errors.Is(err, usecase.ErrInvalidContest) {
			t.Fatalf("%s: got %v, want ErrInvalidContest", tc.name, err)
		}
	}
}
