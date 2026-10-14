package domain

import "strings"

// AllowedGrades are the only grade values stored on students (D1). Every grade
// is its own program (grade-9 … grade-12), so this is the school-grade set.
var AllowedGrades = []string{"9", "10", "11", "12"}

// IsValidGrade reports whether g is exactly one of AllowedGrades.
func IsValidGrade(g string) bool {
	g = strings.TrimSpace(g)
	for _, a := range AllowedGrades {
		if g == a {
			return true
		}
	}
	return false
}

// LegacyGradeToCurrent maps the wrong values written by the old registration
// form ("1".."4", where the label said Grade 9..12) to the real grade. It
// returns ok=false for anything else, including values that are already valid.
// IMPORTANT: this mapping is only applied by cmd/migrate-grade AFTER the
// operator has inspected `DISTINCT grade` (plan §4 D1); never at request time,
// because "1".."4" can never be told apart from a typo there.
func LegacyGradeToCurrent(g string) (string, bool) {
	switch strings.TrimSpace(g) {
	case "1":
		return "9", true
	case "2":
		return "10", true
	case "3":
		return "11", true
	case "4":
		return "12", true
	}
	return "", false
}
