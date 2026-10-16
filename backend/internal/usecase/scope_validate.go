package usecase

import (
	"errors"
	"fmt"

	"victory-contest-go/internal/domain"
)

// ErrInvalidScope is returned when a contest scope does not match the catalog.
var ErrInvalidScope = errors.New("invalid scope")

func programAllowsStream(programs []domain.AcademyProgram, programID, streamID string) bool {
	for _, p := range programs {
		if p.ID == programID {
			return p.AllowsStream(streamID)
		}
	}
	return false
}

// ValidateScopeAgainst checks a Scope against the catalog (plan §5.4.1, D11):
// the program must be active, a specific stream must be offered by it ("common"
// is always allowed), a subject must exist, and a chapter must exist and belong
// to the given subject.
func ValidateScopeAgainst(view *CatalogView, s domain.Scope) error {
	if view == nil {
		return nil // catalog unavailable: do not block admins
	}
	if s.ProgramID == "" {
		return fmt.Errorf("%w: program_id is required", ErrInvalidScope)
	}
	stream := s.StreamID
	if stream == "" {
		stream = domain.StreamCommon
	}
	if stream == domain.StreamCommon {
		found := false
		for _, p := range view.Programs {
			if p.ID == s.ProgramID && p.IsActive {
				found = true
			}
		}
		if !found {
			return fmt.Errorf("%w: %v", ErrInvalidScope, ErrUnknownProgram)
		}
	} else if _, err := ValidateEnrollment(view.Programs, s.ProgramID, stream, false); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidScope, err)
	} else if !programAllowsStream(view.Programs, s.ProgramID, stream) {
		// ValidateEnrollment normalises away the stream for common-only
		// programs; a scope must still name a stream the program actually offers.
		return fmt.Errorf("%w: stream %v is not offered by %v", ErrInvalidScope, stream, s.ProgramID)
	}
	if s.SubjectID != "" {
		ok := false
		for _, sub := range view.Subjects {
			if sub.ID == s.SubjectID {
				ok = true
			}
		}
		if !ok {
			return fmt.Errorf("%w: unknown subject", ErrInvalidScope)
		}
	}
	if s.ChapterID != "" {
		ok := false
		for _, ch := range view.Chapters {
			if ch.ID == s.ChapterID && (s.SubjectID == "" || ch.SubjectID == s.SubjectID) {
				ok = true
			}
		}
		if !ok {
			return fmt.Errorf("%w: unknown chapter for this subject", ErrInvalidScope)
		}
	}
	return nil
}
