package migrations

import (
	"context"
	"fmt"
	"strings"

	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/locnorm"
	"victory-contest-go/internal/repository"
	"victory-contest-go/internal/usecase"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// locationPatch is the correction one student row needs. An empty field means
// "leave that attribute as it is", so a student whose city is still free text can
// get the region its typed name means without inventing a city for them.
type locationPatch struct {
	RegionID string
	Region   string
	CityID   string
	City     string
	Reason   string
}

func (p locationPatch) empty() bool { return p.Reason == "" }

// locationFix resolves one student against the canonical list with the same
// matching rules the admin Locations page uses: a linked student belongs to their
// city entry, and a typed name the list recognises belongs to that entry too.
func locationFix(st domain.Student, owned map[string]usecase.CityLocation,
	cityIdx, regionIdx *locnorm.Index) locationPatch {
	if cur, linked := owned[st.CityID]; linked {
		if st.RegionID == cur.RegionID && st.Region == cur.RegionName && st.City == cur.CityName {
			return locationPatch{}
		}
		// The same city id filed under two regions: the region on the row is a
		// guess, and the promotes that produced it scattered students across both.
		reason := "stale name"
		if st.RegionID != cur.RegionID {
			reason = "duplicate city id"
		}
		return locationPatch{RegionID: cur.RegionID, Region: cur.RegionName,
			CityID: cur.CityID, City: cur.CityName, Reason: reason}
	}
	if city := strings.TrimSpace(st.City); city != "" {
		if k, ok := cityIdx.Resolve(city); ok {
			if cur, owned := owned[k.ID]; owned {
				return locationPatch{RegionID: cur.RegionID, Region: cur.RegionName,
					CityID: cur.CityID, City: cur.CityName, Reason: "typed city spelling"}
			}
		}
	}
	if st.RegionID == "" {
		if k, ok := regionIdx.Resolve(st.Region); ok && st.Region != k.Name {
			return locationPatch{RegionID: k.ID, Region: k.Name, Reason: "typed region"}
		}
	}
	return locationPatch{}
}

// patchExpression writes only the fields the patch carries, and only if the row
// still holds the values the scan read: a row that moved while the migration ran
// is left to the next run instead of being overwritten.
func patchExpression(p locationPatch, st domain.Student) (string, map[string]types.AttributeValue, map[string]string, string) {
	var sets []string
	names := map[string]string{}
	vals := map[string]types.AttributeValue{
		":was_city_id":   strAttr(st.CityID),
		":was_region_id": strAttr(st.RegionID),
	}
	add := func(attr, v string) {
		sets = append(sets, "#"+attr+" = :"+attr)
		names["#"+attr] = attr
		vals[":"+attr] = strAttr(v)
	}
	if p.RegionID != "" {
		add("region_id", p.RegionID)
	}
	if p.Region != "" {
		add("region", p.Region)
	}
	if p.CityID != "" {
		add("city_id", p.CityID)
	}
	if p.City != "" {
		add("city", p.City)
	}
	cond := "attribute_exists(id) AND (attribute_not_exists(city_id) OR city_id = :was_city_id) AND (attribute_not_exists(region_id) OR region_id = :was_region_id)"
	return strings.Join(sets, ", "), vals, names, cond
}

// LocationRepoint is one student's corrected location (also the backup row).
type LocationRepoint struct {
	ID           string `json:"id"`
	TelegramID   string `json:"telegram_id,omitempty"`
	Reason       string `json:"reason"`
	FromRegionID string `json:"from_region_id,omitempty"`
	FromRegion   string `json:"from_region,omitempty"`
	FromCityID   string `json:"from_city_id,omitempty"`
	FromCity     string `json:"from_city,omitempty"`
	ToRegionID   string `json:"to_region_id,omitempty"`
	ToRegion     string `json:"to_region,omitempty"`
	ToCityID     string `json:"to_city_id,omitempty"`
	ToCity       string `json:"to_city,omitempty"`
}

// locationWrite pairs a pending change with the row it came from: the scanned
// item is the only faithful source of the table's complete primary key.
type locationWrite struct {
	patch   locationPatch
	student domain.Student
	item    map[string]types.AttributeValue
}

// MigrateLocationDedupe repairs the location data the pre-merge promote path left
// behind: one city id stored under two regions, rows pointing at a city the list
// no longer holds, and city names kept as each student typed them ("Adis abeba",
// "A.A") beside the one real entry — which is why the dashboard showed several
// Addis Ababa rows and a promote appeared to change nothing. It rewrites the list
// to one entry per city and relinks every student onto it.
//
// Idempotent: a row already on its canonical entry needs no write, and every
// write is conditional on the values the scan read.
func MigrateLocationDedupe(ctx context.Context, env Env, refTable, studentTable string) (Result, error) {
	if refTable == "" {
		refTable = "reference_data"
	}
	if studentTable == "" {
		studentTable = "student"
	}
	store := repository.NewLocationDynamoStore(env.DB, refTable)
	cur, err := store.Load()
	if err != nil {
		return Result{}, fmt.Errorf("load %s: %w", refTable, err)
	}
	if cur == nil || len(cur.Regions) == 0 {
		return Result{Summary: "no stored location list, nothing to dedupe", Deferred: true}, nil
	}
	locs, dropped := usecase.CanonicalLocations(*cur)
	owned := usecase.CityLocations(locs)
	cityIdx := locnorm.NewIndex(usecase.KnownCities(locs))
	regionIdx := locnorm.NewIndex(usecase.KnownRegions(locs))

	items, err := scanAll(ctx, env.DB, studentTable)
	if err != nil {
		return Result{}, fmt.Errorf("scan %s: %w", studentTable, err)
	}
	var changes []LocationRepoint
	var writes []locationWrite
	byReason := map[string]int{}
	unchanged, unreadable := 0, 0
	for _, it := range items {
		var st domain.Student
		if err := attributevalue.UnmarshalMap(it, &st); err != nil {
			unreadable++
			continue
		}
		p := locationFix(st, owned, cityIdx, regionIdx)
		if p.empty() {
			unchanged++
			continue
		}
		byReason[p.Reason]++
		changes = append(changes, LocationRepoint{
			ID: st.ID, TelegramID: st.TelegramID, Reason: p.Reason,
			FromRegionID: st.RegionID, FromRegion: st.Region, FromCityID: st.CityID, FromCity: st.City,
			ToRegionID: orKeep(p.RegionID, st.RegionID), ToRegion: orKeep(p.Region, st.Region),
			ToCityID: orKeep(p.CityID, st.CityID), ToCity: orKeep(p.City, st.City),
		})
		writes = append(writes, locationWrite{patch: p, student: st, item: it})
	}
	summary := fmt.Sprintf("students to relink=%d (duplicate city id=%d, typed city spelling=%d, typed region=%d, stale name=%d), duplicate city entries=%d, already canonical=%d, unreadable rows=%d",
		len(changes), byReason["duplicate city id"], byReason["typed city spelling"],
		byReason["typed region"], byReason["stale name"], dropped, unchanged, unreadable)
	for _, c := range changes {
		say(env, "relink %s (%s): %s/%s -> %s/%s", c.ID, c.Reason, c.FromRegion, c.FromCity, c.ToRegion, c.ToCity)
	}
	say(env, "%s", summary)
	if !env.Apply {
		return Result{Summary: summary + " (nothing written)"}, nil
	}
	if len(changes) == 0 && dropped == 0 {
		return Result{Summary: "already canonical: " + summary}, nil
	}
	path, err := writeBackup(env, "migrate-location-dedupe", map[string]any{
		"dropped_city_entries": dropped,
		"locations_before":     *cur,
		"locations_after":      locs,
		"students":             changes,
	})
	if err != nil {
		return Result{}, fmt.Errorf("backup: %w", err)
	}
	say(env, "backup: %s", path)

	pKey, err := keyNames(ctx, env.DB, studentTable)
	if err != nil {
		return Result{}, err
	}
	done, failed := 0, 0
	for _, w := range writes {
		key, err := fullKey(pKey, w.item)
		if err != nil {
			failed++
			say(env, "fail %s: %v", w.student.ID, err)
			continue
		}
		expr, vals, names, cond := patchExpression(w.patch, w.student)
		_, err = env.DB.UpdateItem(ctx, &dynamodb.UpdateItemInput{
			TableName:                 aws.String(studentTable),
			Key:                       key,
			UpdateExpression:          aws.String("SET " + expr),
			ConditionExpression:       aws.String(cond),
			ExpressionAttributeValues: vals,
			ExpressionAttributeNames:  names,
		})
		if err != nil {
			var cf *types.ConditionalCheckFailedException
			if asCondFail(err, &cf) {
				continue // the row changed while the migration ran
			}
			failed++
			say(env, "fail %s: %v", w.student.ID, err)
			continue
		}
		done++
	}
	// The list shrinks only after its students are home: a failed write leaves the
	// duplicate entry in place, and the next boot retries the whole migration.
	if dropped > 0 {
		if err := store.Save(locs); err != nil {
			return Result{}, fmt.Errorf("save %s: %w", refTable, err)
		}
	}
	sum := fmt.Sprintf("relinked=%d duplicate city entries dropped=%d failed=%d", done, dropped, failed)
	if failed > 0 {
		return Result{Summary: sum}, fmt.Errorf("%d location relink writes failed", failed)
	}
	return Result{Summary: sum}, nil
}

func orKeep(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}
