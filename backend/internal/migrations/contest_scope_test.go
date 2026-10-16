package migrations

import "testing"

func TestContestProgramFromGrade(t *testing.T) {
	cases := map[string]string{"12": "grade-12", "9": "grade-9", "Grade 11": "grade-11", " 10 ": "grade-10"}
	for in, want := range cases {
		if got, ok := contestProgramFromGrade(in); !ok || got != want {
			t.Errorf("%q -> %q,%v want %q", in, got, ok, want)
		}
	}
	for _, in := range []string{"", "4", "13", "all"} {
		if _, ok := contestProgramFromGrade(in); ok {
			t.Errorf("%q must not map", in)
		}
	}
}
