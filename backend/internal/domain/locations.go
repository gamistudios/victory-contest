package domain

// Locations is the admin-managed region/city list (plan §5.1, decision 10).
// Students store stable ids; "Other" is free text stored in Student.Region/City
// with empty ids.
type Locations struct {
	Regions []Region `json:"regions"`
}

type Region struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Active    bool   `json:"active"`
	SortOrder int    `json:"sort_order"`
	Cities    []City `json:"cities"`
}

type City struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Active bool   `json:"active"`
}

// FindRegion returns the active region with the id.
func (l Locations) FindRegion(id string) (Region, bool) {
	for _, r := range l.Regions {
		if r.ID == id && r.Active {
			return r, true
		}
	}
	return Region{}, false
}

// ValidatePick checks a student's location choice: either valid ids (city must
// belong to the region), or both ids empty with other-text of >= 2 characters.
func (l Locations) ValidatePick(regionID, cityID, regionText, cityText string) bool {
	if regionID == "" && cityID == "" {
		return len([]rune(trimSpace(regionText))) >= 2 && len([]rune(trimSpace(cityText))) >= 2
	}
	r, ok := l.FindRegion(regionID)
	if !ok {
		return false
	}
	if cityID == "" {
		return len([]rune(trimSpace(cityText))) >= 2 // known region, "Other" city
	}
	for _, c := range r.Cities {
		if c.ID == cityID && c.Active {
			return true
		}
	}
	return false
}

func trimSpace(s string) string {
	start, end := 0, len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t' || s[start] == '\n' || s[start] == '\r') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t' || s[end-1] == '\n' || s[end-1] == '\r') {
		end--
	}
	return s[start:end]
}
