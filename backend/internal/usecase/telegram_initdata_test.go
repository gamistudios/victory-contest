package usecase

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"
)

const testBotToken = "123456:ABC-DEF"

// signInitData is the test-side mirror of the Telegram protocol: it builds the
// data-check-string (all params except hash, sorted, key=value lines joined by
// \n), HMACs it under the WebAppData-derived secret and returns a complete
// initData query string.
func signInitData(params url.Values) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		if k != "hash" {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	lines := make([]string, 0, len(keys))
	for _, k := range keys {
		lines = append(lines, k+"="+params.Get(k))
	}
	secretKey := hmac.New(sha256.New, []byte("WebAppData"))
	secretKey.Write([]byte(testBotToken))
	mac := hmac.New(sha256.New, secretKey.Sum(nil))
	mac.Write([]byte(strings.Join(lines, "\n")))
	params.Set("hash", hex.EncodeToString(mac.Sum(nil)))
	return params.Encode()
}

func baseParams(authDate time.Time) url.Values {
	return url.Values{
		"auth_date": []string{strconv.FormatInt(authDate.Unix(), 10)},
		"user":      []string{`{"id":4242,"first_name":"Ada","username":"ada42"}`},
	}
}

var testNow = time.Unix(1_800_000_000, 0)

func TestValidateTelegramInitDataValid(t *testing.T) {
	initData := signInitData(baseParams(testNow.Add(-time.Minute)))

	telegramID, authDate, err := ValidateTelegramInitData(initData, testBotToken, testNow)
	if err != nil {
		t.Fatalf("valid initData rejected: %v", err)
	}
	if telegramID != "4242" {
		t.Errorf("telegramID = %q, want 4242", telegramID)
	}
	if want := testNow.Add(-time.Minute).Unix(); authDate != want {
		t.Errorf("authDate = %d, want %d", authDate, want)
	}
}

func TestValidateTelegramInitDataTamperedHash(t *testing.T) {
	params := baseParams(testNow)
	initData := signInitData(params)
	// Flip one hex char of the signature.
	i := strings.Index(initData, "hash=") + len("hash=")
	flipped := params.Get("hash")
	pos := i
	if flipped[0] == '0' {
		flipped = "1" + flipped[1:]
	} else {
		flipped = "0" + flipped[1:]
	}
	tampered := initData[:pos] + flipped + initData[pos+1:]

	if _, _, err := ValidateTelegramInitData(tampered, testBotToken, testNow); err == nil {
		t.Fatal("tampered hash accepted")
	}
	// Same payload under a different bot token must fail too.
	if _, _, err := ValidateTelegramInitData(initData, "999:OTHER", testNow); err == nil {
		t.Fatal("initData signed for another bot accepted")
	}
}

func TestValidateTelegramInitDataStaleAuthDate(t *testing.T) {
	stale := signInitData(baseParams(testNow.Add(-TelegramInitDataMaxAge - time.Minute)))
	if _, _, err := ValidateTelegramInitData(stale, testBotToken, testNow); err == nil {
		t.Fatal("initData older than TelegramInitDataMaxAge accepted")
	}
	fresh := signInitData(baseParams(testNow.Add(-TelegramInitDataMaxAge + time.Minute)))
	if _, _, err := ValidateTelegramInitData(fresh, testBotToken, testNow); err != nil {
		t.Fatalf("initData just inside max age rejected: %v", err)
	}
}

func TestValidateTelegramInitDataExtraParamInjection(t *testing.T) {
	// A valid signature plus an UNSIGNED extra query param: the canonical
	// data-check-string now contains injected=pwned and no longer matches.
	valid := signInitData(baseParams(testNow))
	if _, _, err := ValidateTelegramInitData(valid+"&injected=pwned", testBotToken, testNow); err == nil {
		t.Fatal("extra unsigned parameter accepted")
	}

	// A hash computed over an UNSORTED join must be rejected even though the
	// payload carries all the right keys: verification always re-sorts.
	params := baseParams(testNow)
	params.Set("start_param", "abc")
	secretKey := hmac.New(sha256.New, []byte("WebAppData"))
	secretKey.Write([]byte(testBotToken))
	unsorted := hmac.New(sha256.New, secretKey.Sum(nil))
	unsorted.Write([]byte("user=" + params.Get("user") + "\nauth_date=" + params.Get("auth_date") + "\nstart_param=abc"))
	spoof := url.Values{}
	for k, v := range params {
		spoof[k] = v
	}
	spoof.Set("hash", hex.EncodeToString(unsorted.Sum(nil)))
	if _, _, err := ValidateTelegramInitData(spoof.Encode(), testBotToken, testNow); err == nil {
		t.Fatal("hash over unsorted data-check-string accepted")
	}

	// The same payload signed the canonical way validates.
	if _, _, err := ValidateTelegramInitData(signInitData(params), testBotToken, testNow); err != nil {
		t.Fatalf("correctly signed extra-param payload rejected: %v", err)
	}
}

func TestValidateTelegramInitDataMalformed(t *testing.T) {
	if _, _, err := ValidateTelegramInitData("auth_date=1&user=%7B%22id%22%3A1%7D", testBotToken, testNow); err == nil {
		t.Error("missing hash accepted")
	}
	if _, _, err := ValidateTelegramInitData("", testBotToken, testNow); err == nil {
		t.Error("empty initData accepted")
	}
	if _, _, err := ValidateTelegramInitData(signInitData(baseParams(testNow)), "", testNow); err == nil {
		t.Error("empty bot token accepted")
	}
	// Signature ok, but auth_date is not a number / user is not JSON.
	params := baseParams(testNow)
	params.Set("auth_date", "soon")
	if _, _, err := ValidateTelegramInitData(signInitData(params), testBotToken, testNow); err == nil {
		t.Error("non-numeric auth_date accepted")
	}
	params = baseParams(testNow)
	params.Set("user", "not-json")
	if _, _, err := ValidateTelegramInitData(signInitData(params), testBotToken, testNow); err == nil {
		t.Error("non-JSON user accepted")
	}
	// Signed without auth_date at all.
	params = url.Values{"user": []string{`{"id":7}`}}
	if _, _, err := ValidateTelegramInitData(signInitData(params), testBotToken, testNow); err == nil {
		t.Error("missing auth_date accepted")
	}
}
