package migrations

import (
	"context"
	"testing"
)

func noop(context.Context, Env) (Result, error) { return Result{}, nil }

func TestValidateRegistry(t *testing.T) {
	if err := Validate(Registry()); err != nil {
		t.Fatalf("shipped registry invalid: %v", err)
	}
}

func TestValidateRejectsBadOrderAndIDs(t *testing.T) {
	cases := map[string][]Migration{
		"bad id":    {{ID: "grade", Run: noop}},
		"duplicate": {{ID: "20261014-001-a", Run: noop}, {ID: "20261014-001-a", Run: noop}},
		"descending": {{ID: "20261014-002-a", Run: noop}, {ID: "20261014-001-b", Run: noop}},
		"no run":    {{ID: "20261014-001-a"}},
	}
	for name, l := range cases {
		if Validate(l) == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}

func TestEnabled(t *testing.T) {
	get := func(v string) func(string) string { return func(string) string { return v } }
	for v, want := range map[string]bool{"": true, "on": true, "off": false, "FALSE": false, "0": false} {
		if Enabled(get(v)) != want {
			t.Errorf("AUTO_MIGRATE=%q: want %v", v, want)
		}
	}
}
