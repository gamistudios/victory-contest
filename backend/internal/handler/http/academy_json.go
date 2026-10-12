package http

import (
	"reflect"

	"github.com/gin-gonic/gin"
)

// Academy content arrives from DynamoDB JSON documents, hand-written seeds and
// AI-generated drafts, so a list field can legitimately be absent. Go marshals a
// nil slice/map as `null`, while the shared contract (frontend/src/types/academy.ts)
// declares these fields as arrays - `.map()` on `null` is a runtime crash in the
// student app, not a type error. academySafe closes that gap at the wire boundary:
// every nil collection becomes an empty one, so a response can never carry `null`
// where the client expects a list. It runs at serialization time, which means the
// stored documents and the existing normalize* helpers stay as they are, and new
// fields are covered without anyone remembering to initialise them.
//
// `omitempty` list fields are unaffected (an empty list is still omitted), and
// []byte keeps its JSON string/null encoding.

// academySafe returns a copy of v with nil slices and maps replaced by empty ones.
func academySafe(v any) any {
	if v == nil {
		return nil
	}
	out := academySafeValue(reflect.ValueOf(v))
	if !out.IsValid() || !out.CanInterface() {
		return v
	}
	return out.Interface()
}

func academySafeValue(rv reflect.Value) reflect.Value {
	switch rv.Kind() {
	case reflect.Pointer:
		if rv.IsNil() {
			return rv
		}
		elem := academySafeValue(rv.Elem())
		if !elem.IsValid() || elem.Type() != rv.Type().Elem() {
			return rv
		}
		p := reflect.New(rv.Type().Elem())
		p.Elem().Set(elem)
		return p
	case reflect.Interface:
		if rv.IsNil() {
			return rv
		}
		inner := academySafeValue(rv.Elem())
		if !inner.IsValid() || !inner.CanInterface() {
			return rv
		}
		out := reflect.New(rv.Type()).Elem()
		out.Set(inner)
		return out
	case reflect.Slice:
		if rv.IsNil() {
			if rv.Type().Elem().Kind() == reflect.Uint8 {
				return rv // []byte: leave the null/string semantics alone
			}
			return reflect.MakeSlice(rv.Type(), 0, 0)
		}
		out := reflect.MakeSlice(rv.Type(), rv.Len(), rv.Len())
		for i := 0; i < rv.Len(); i++ {
			e := academySafeValue(rv.Index(i))
			if !e.IsValid() || e.Type() != rv.Type().Elem() || !e.CanInterface() {
				e = rv.Index(i)
			}
			out.Index(i).Set(e)
		}
		return out
	case reflect.Map:
		if rv.IsNil() {
			return reflect.MakeMap(rv.Type())
		}
		out := reflect.MakeMapWithSize(rv.Type(), rv.Len())
		iter := rv.MapRange()
		for iter.Next() {
			val := academySafeValue(iter.Value())
			if !val.IsValid() || val.Type() != iter.Value().Type() || !val.CanInterface() {
				val = iter.Value()
			}
			out.SetMapIndex(iter.Key(), val)
		}
		return out
	case reflect.Struct:
		out := reflect.New(rv.Type()).Elem()
		out.Set(rv)
		t := rv.Type()
		for i := 0; i < t.NumField(); i++ {
			f := out.Field(i)
			if !f.CanSet() {
				continue // unexported: the copy already carries the value
			}
			nv := academySafeValue(f)
			if nv.IsValid() && nv.Type() == f.Type() && nv.CanInterface() {
				f.Set(nv)
			}
		}
		return out
	default:
		return rv
	}
}

// academyWrite is the only way an Academy handler sends a body.
func academyWrite(c *gin.Context, status int, payload any) {
	c.JSON(status, academySafe(payload))
}
