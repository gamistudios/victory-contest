package usecase

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

// TelegramInitDataMaxAge is how long a WebApp initData blob stays usable for
// the auth exchange. Telegram itself leaves revocation to auth_date freshness;
// anything older than this is treated as a replay and rejected (S2 / #6).
const TelegramInitDataMaxAge = 7 * 24 * time.Hour

// ValidateTelegramInitData verifies a Telegram WebApp initData string per the
// official protocol (https://core.telegram.org/bots/webapps#validating-data):
//
//  1. Parse the query string; `hash` is the signature, every other key sorted
//     alphabetically and joined as key=value lines (the "data-check-string")
//     is the signed payload.
//  2. secretKey = HMAC_SHA256(key="WebAppData", msg=botToken);
//     expected  = HMAC_SHA256(key=secretKey, msg=dataCheckString), hex-encoded.
//  3. Constant-time compare; reject when auth_date is older than
//     TelegramInitDataMaxAge relative to now.
//
// It returns the Telegram user id (from the `user` JSON field) and the
// auth_date epoch seconds on success.
func ValidateTelegramInitData(initData, botToken string, now time.Time) (telegramID string, authDate int64, err error) {
	if botToken == "" {
		return "", 0, errors.New("telegram bot token is not configured")
	}
	values, err := url.ParseQuery(initData)
	if err != nil {
		return "", 0, fmt.Errorf("malformed initData: %w", err)
	}
	gotHash := values.Get("hash")
	if gotHash == "" {
		return "", 0, errors.New("initData is missing 'hash'")
	}

	// data-check-string: all keys except hash, sorted, key=value joined by \n.
	keys := make([]string, 0, len(values))
	for k := range values {
		if k != "hash" {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	lines := make([]string, 0, len(keys))
	for _, k := range keys {
		lines = append(lines, k+"="+values.Get(k))
	}
	dataCheckString := strings.Join(lines, "\n")

	secretKey := hmac.New(sha256.New, []byte("WebAppData"))
	secretKey.Write([]byte(botToken))
	mac := hmac.New(sha256.New, secretKey.Sum(nil))
	mac.Write([]byte(dataCheckString))
	want, err := hex.DecodeString(strings.ToLower(gotHash))
	if err != nil {
		return "", 0, errors.New("initData hash is not valid hex")
	}
	if subtle.ConstantTimeCompare(mac.Sum(nil), want) != 1 {
		return "", 0, errors.New("initData signature mismatch")
	}

	rawAuthDate := values.Get("auth_date")
	if rawAuthDate == "" {
		return "", 0, errors.New("initData is missing 'auth_date'")
	}
	authDate, err = strconv.ParseInt(rawAuthDate, 10, 64)
	if err != nil {
		return "", 0, fmt.Errorf("unparsable auth_date %q: %w", rawAuthDate, err)
	}
	if now.Sub(time.Unix(authDate, 0)) > TelegramInitDataMaxAge {
		return "", 0, errors.New("initData is too old")
	}

	var user struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal([]byte(values.Get("user")), &user); err != nil {
		return "", 0, fmt.Errorf("unparsable user in initData: %w", err)
	}
	if user.ID == 0 {
		return "", 0, errors.New("initData user is missing an id")
	}
	return strconv.FormatInt(user.ID, 10), authDate, nil
}
