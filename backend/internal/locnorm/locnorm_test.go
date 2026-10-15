package locnorm

import "testing"

// The fixtures below are the spellings students actually typed in production.
func prodCities() []Known {
	type cc struct{ region, city string }
	list := []cc{
		{"Addis Ababa", "Addis Ababa"},
		{"Oromia", "Addis Ababa"}, // the duplicate a promote once minted
		{"Oromia", "Adama"}, {"Oromia", "Jimma"}, {"Oromia", "Bishoftu"},
		{"Oromia", "Shashemene"}, {"Oromia", "Nekemte"}, {"Oromia", "Ambo"},
		{"Oromia", "Asella"}, {"Oromia", "Robe"}, {"Oromia", "Zeway(Batu)"},
		{"Sidama", "Hawassa"}, {"Sidama", "Yirgalem"},
		{"Amhara", "Bahir Dar"}, {"Amhara", "Gondar"}, {"Amhara", "Dessie"},
		{"Amhara", "Debre Markos"}, {"Amhara", "Debre Birhan"},
		{"Tigray", "Mekelle"}, {"Tigray", "Adigrat"}, {"Tigray", "Axum"},
		{"Dire Dawa", "Dire Dawa"}, {"Harari", "Harar"}, {"Somali", "Jijiga"},
		{"South Ethiopia", "Arba Minch"}, {"South Ethiopia", "Sodo"},
		{"Afar", "Semera"}, {"Afar", "Asaita"}, {"Gambela", "Gambela"},
		{"Benishangul-Gumuz", "Assosa"}, {"Central Ethiopia", "Hosaena"},
		{"Central Ethiopia", "Wolkite"}, {"South West Ethiopia", "Bonga"},
		{"South West Ethiopia", "Mizan Teferi"},
	}
	out := make([]Known, 0, len(list))
	for _, c := range list {
		out = append(out, Known{
			ID:        Fold(c.city),
			Name:      c.city,
			GroupID:   Fold(c.region),
			GroupName: c.region,
		})
	}
	return out
}

func TestFoldUnifiesTypedSpellings(t *testing.T) {
	cases := map[string]string{
		"Addis Ababa":  "adisababa",
		"Addis Ababa ": "adisababa",
		"ADDIS ABABA ": "adisababa",
		"Addis ababa":  "adisababa",
		"AddisAbaba":   "adisababa",
		"Adis Abeba":   "adisababa",
		"Adissabeba":   "adisababa",
		"Addis abeba":  "adisababa",
		"Adiss Ababa":  "adisababa",
		"Oromiya":      "oromia",
		"Gonder":       "gondar",
		"Hossana":      "hosana",
		// An initialism folds to one letter; Abbrev is what recognises it.
		"A.A": "a", "A/A": "a", "AA": "a",
	}
	for in, want := range cases {
		if got := Fold(in); got != want {
			t.Errorf("Fold(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestResolveClustersEveryAddisSpelling(t *testing.T) {
	x := NewIndex(prodCities())
	variants := []string{
		"Addis Ababa", "Addis Ababa ", "Addis ababa", "AddisAbaba", "Adis Abeba",
		"Adissabeba", "Addis abeba", "Adiss Ababa", "A.A", "A/A", "AA", "Addis",
		"Addis abab", "adiss abeba",
	}
	for _, v := range variants {
		k, ok := x.Resolve(v)
		if !ok || k.Name != "Addis Ababa" || k.GroupName != "Addis Ababa" {
			t.Errorf("Resolve(%q) = %+v ok=%v, want the Addis Ababa region's Addis Ababa", v, k, ok)
		}
	}
	// One cluster key for all of them, so the free-text list shows one row.
	first := x.Key(variants[0])
	for _, v := range variants {
		if got := x.Key(v); got != first {
			t.Errorf("Key(%q) = %q, want the shared cluster key %q", v, got, first)
		}
	}
}

// A city stored twice is still one place: the copy under the region of the same
// name wins, so a promote can never keep feeding the stray duplicate.
func TestResolvePrefersHomenameRegionCopy(t *testing.T) {
	x := NewIndex(prodCities())
	k, ok := x.Resolve("Adis abeba")
	if !ok {
		t.Fatal("no match")
	}
	if Fold(k.GroupName) != Fold(k.Name) {
		t.Errorf("resolved into region %q, want the region named after the city", k.GroupName)
	}
}

// Typing the short name of a place already stored under a longer name must reuse
// it, not mint a second city: "Zeway" is the stored "Zeway(Batu)".
func TestResolveTruncationOntoKnownCity(t *testing.T) {
	x := NewIndex(prodCities())
	for _, v := range []string{"Zeway", "Zeway ", "zeway Batu", "Zawa Batu"} {
		k, ok := x.Resolve(v)
		if !ok || k.Name != "Zeway(Batu)" {
			t.Errorf("Resolve(%q) = %+v ok=%v, want Zeway(Batu)", v, k, ok)
		}
	}
}

func TestResolveLeavesOtherPlacesAlone(t *testing.T) {
	x := NewIndex(prodCities())
	// These are different places, or junk: resolving any of them onto Addis Ababa
	// (or onto each other) would move students to the wrong city.
	for _, v := range []string{"Bole", "yeka", "Adama", "AdamaRobe", "Bale Robe", "Test City", "P/s", "Ethiopia", "sheger", "Halaba", "Bedelle"} {
		if k, ok := x.Resolve(v); ok && k.GroupName == "Addis Ababa" {
			t.Errorf("Resolve(%q) landed on %q inside Addis Ababa", v, k.Name)
		}
	}
	for _, v := range []string{"Adama", "Bole", "Test City", "P/s"} {
		k, ok := x.Resolve(v)
		if v == "Adama" && (!ok || k.Name != "Adama") {
			t.Errorf("Resolve(Adama) = %+v ok=%v, want Adama", k, ok)
		}
		if v != "Adama" && ok {
			t.Errorf("Resolve(%q) matched %q, want no match", v, k.Name)
		}
	}
}

func TestResolveExactSpellingsOfKnownCities(t *testing.T) {
	x := NewIndex(prodCities())
	for typed, want := range map[string]string{
		"Mekell":   "Mekelle",
		"Mekele":   "Mekelle",
		"Bahirdar": "Bahir Dar",
		"Diredawa": "Dire Dawa",
		"Assella":  "Asella",
		"Holeta":   "", // not stored: must stay unmatched
		"Harer":    "Harar",
		"Desss":    "Dessie",
	} {
		k, ok := x.Resolve(typed)
		if want == "" {
			if ok {
				t.Errorf("Resolve(%q) matched %q, want no match", typed, k.Name)
			}
			continue
		}
		if !ok || k.Name != want {
			t.Errorf("Resolve(%q) = %+v ok=%v, want %q", typed, k, ok, want)
		}
	}
}

func TestAbbrevShape(t *testing.T) {
	cases := map[string]string{
		"A.A": "aa", "A/A": "aa", "AA": "aa", "Addis Ababa": "aa",
		"Oromia": "", "Adama": "", "Bole": "", "Jimma": "",
	}
	for in, want := range cases {
		if got := Abbrev(in); got != want {
			t.Errorf("Abbrev(%q) = %q, want %q", in, got, want)
		}
	}
}
