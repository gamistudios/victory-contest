// Package locnorm folds the typed spellings of Ethiopian place names onto one
// comparison key, so "Adis Abeba", "Addis Ababa " and "AddisAbaba" are treated
// as the same city. Students type names in Latin script by ear, so a promote
// must recognise what they typed as the place it already knows about.
package locnorm

import "strings"

// Fold lowercases, drops everything that is not a letter or digit, collapses a
// run of one letter ("Adiss" -> "Adis") and unifies the two vowel swaps that
// Latin transcriptions of these names trade freely ("Abeba" == "Ababa",
// "Oromiya" == "Oromia").
func Fold(s string) string {
	var b strings.Builder
	var prev byte
	for _, r := range strings.ToLower(s) {
		var c byte
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			c = byte(r)
		default:
			continue // spaces, dots, slashes, apostrophes carry no information
		}
		switch c {
		case 'e':
			c = 'a'
		case 'y':
			c = 'i'
		}
		if c == prev {
			continue
		}
		b.WriteByte(c)
		prev = c
	}
	return b.String()
}

// Abbrev returns the short form a spelling stands for, or "" when the value is
// not abbreviation-shaped and must only match by Fold. Token initials give
// "A.A" -> "aa"; a single run of at most three letters is read as an initialism
// too, so "AA" also means Addis Ababa. Unlike Fold this keeps doubled letters,
// which is what makes "AA" and "A.A" the same initialism.
func Abbrev(s string) string {
	toks := rawTokens(s)
	if len(toks) >= 2 {
		var b strings.Builder
		for _, t := range toks {
			b.WriteString(t[:1])
		}
		return b.String()
	}
	if len(toks) == 1 && len(toks[0]) <= 3 {
		return toks[0]
	}
	return ""
}

// rawTokens splits s on anything that is not a letter or digit and folds each
// piece (lowercase, vowel swaps) without collapsing runs, so "A.A" gives
// ["a","a"] and "AA" gives ["aa"].
func rawTokens(s string) []string {
	var out []string
	var cur []byte
	flush := func() {
		if len(cur) > 0 {
			out = append(out, string(cur))
			cur = cur[:0]
		}
	}
	for _, r := range strings.ToLower(s) {
		var c byte
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			c = byte(r)
		default:
			flush()
			continue
		}
		switch c {
		case 'e':
			c = 'a'
		case 'y':
			c = 'i'
		}
		cur = append(cur, c)
	}
	flush()
	return out
}

// Known is one entry of a reference list: a region, or a city whose region is
// recorded in GroupID/GroupName.
type Known struct {
	ID        string
	Name      string
	GroupID   string
	GroupName string
}

// groupFold lets a city stored under a region of the same name ("Addis Ababa"
// inside "Addis Ababa") win over a stray copy of that city elsewhere.
type entry struct {
	Known
	fold   string
	abbrev string
}

// Index resolves typed spellings onto one known entry.
type Index struct {
	entries  []entry
	byFold   map[string][]int
	byAbbrev map[string][]int
}

func NewIndex(list []Known) *Index {
	x := &Index{byFold: map[string][]int{}, byAbbrev: map[string][]int{}}
	for _, k := range list {
		f := Fold(k.Name)
		if f == "" {
			continue
		}
		i := len(x.entries)
		x.entries = append(x.entries, entry{Known: k, fold: f, abbrev: Abbrev(k.Name)})
		x.byFold[f] = append(x.byFold[f], i)
		if x.entries[i].abbrev != "" {
			x.byAbbrev[x.entries[i].abbrev] = append(x.byAbbrev[x.entries[i].abbrev], i)
		}
	}
	return x
}

// Resolve maps a typed name onto the known entry it means. ok=false means the
// spelling matches nothing, or matches more than one entry: guessing would
// silently move students to the wrong place, so the caller must treat it as
// unmatched and let the admin decide.
func (x *Index) Resolve(s string) (Known, bool) {
	f := Fold(s)
	if f == "" {
		return Known{}, false
	}
	if cands := x.byFold[f]; len(cands) == 1 {
		return x.entries[cands[0]].Known, true
	} else if len(cands) > 1 {
		return x.pick(cands), true
	}
	if a := Abbrev(s); a != "" {
		if cands := x.byAbbrev[a]; len(cands) == 1 {
			return x.entries[cands[0]].Known, true
		} else if len(cands) > 1 {
			return x.pick(cands), true
		}
	}
	// A truncated spelling ("Addis", "Desss", "Mizan") names a known place when
	// exactly one known name starts with it, so three letters is the shortest
	// run allowed.
	if len(f) >= 3 {
		var cands []int
		seen := map[string]bool{}
		for i, e := range x.entries {
			if len(e.fold) > len(f) && strings.HasPrefix(e.fold, f) && !seen[e.fold] {
				seen[e.fold] = true
				cands = append(cands, i)
			}
		}
		if len(cands) == 1 {
			return x.entries[cands[0]].Known, true
		}
	}
	return Known{}, false
}

// pick chooses among entries that share a canonical key: the copy stored under a
// region of the same name wins, else the first in list order. Two entries with
// one name are one place, not an ambiguous choice.
func (x *Index) pick(cands []int) Known {
	for _, i := range cands {
		e := x.entries[i]
		if e.GroupName != "" && Fold(e.GroupName) == e.fold {
			return e.Known
		}
	}
	return x.entries[cands[0]].Known
}

// Key returns the clustering key for a typed name: the id of the known entry it
// resolves to, prefixed so ids and folds can never collide, else its fold.
func (x *Index) Key(s string) string {
	if k, ok := x.Resolve(s); ok {
		return "id:" + k.ID
	}
	return "fold:" + Fold(s)
}
