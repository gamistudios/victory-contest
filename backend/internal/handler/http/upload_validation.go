package http

import (
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
)

// maxUploadBytes is the hard cap on every multipart image upload (10 MB),
// matching what the student Payment page promises in its UI copy
// (README §9 #50: uploads previously had no size or type limit).
const maxUploadBytes = 10 << 20

// ErrUploadRejected marks a client file that failed the size/type guard;
// handlers map it to HTTP 400 (everything else in the upload path is a
// server-side failure).
var ErrUploadRejected = errors.New("upload rejected")

// validateImageUpload enforces the size cap and sniffs the content before a
// file is handed to Cloudinary. Detection uses the actual bytes
// (http.DetectContentType), not the client-declared Content-Type header, so a
// renamed .exe or a spoofed mime type is rejected.
func validateImageUpload(header *multipart.FileHeader) error {
	if header == nil {
		return nil
	}
	if header.Size > maxUploadBytes {
		return fmt.Errorf("%w: image is %.1f MB; the limit is %d MB", ErrUploadRejected, float64(header.Size)/(1<<20), maxUploadBytes>>20)
	}
	file, err := header.Open()
	if err != nil {
		return fmt.Errorf("%w: failed to open uploaded file", ErrUploadRejected)
	}
	defer file.Close()

	buf := make([]byte, 512)
	n, err := file.Read(buf)
	if err != nil && n == 0 {
		return fmt.Errorf("%w: uploaded file is empty", ErrUploadRejected)
	}
	if kind := http.DetectContentType(buf[:n]); kind == "image/jpeg" || kind == "image/png" || kind == "image/gif" || kind == "image/webp" {
		return nil
	}
	return fmt.Errorf("%w: unsupported file type %q: only JPEG, PNG, GIF and WebP images are accepted", ErrUploadRejected, http.DetectContentType(buf[:n]))
}

// uploadStatus maps an upload-path error to its HTTP status: rejected client
// files are 400, anything else (e.g. Cloudinary) stays 500.
func uploadStatus(err error) int {
	if errors.Is(err, ErrUploadRejected) {
		return http.StatusBadRequest
	}
	return http.StatusInternalServerError
}
