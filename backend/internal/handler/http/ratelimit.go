package http

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// tokenLimiter is a small in-memory per-client token bucket: `rate` tokens
// per second up to `burst`, evicted after idle. Enough to blunt abusive
// loops against expensive endpoints (Gemini-backed /api/ai/*, issue #9);
// it is per-process on purpose — a shared store belongs to the infra layer.
type tokenLimiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
	rate    float64 // tokens per second
	burst   float64
	idle    time.Duration
	now     func() time.Time // injectable for tests
}

type bucket struct {
	tokens  float64
	updated time.Time
}

func newTokenLimiter(requestsPerMinute int, burst float64) *tokenLimiter {
	return &tokenLimiter{
		buckets: map[string]*bucket{},
		rate:    float64(requestsPerMinute) / 60.0,
		burst:   burst,
		idle:    time.Hour,
		now:     time.Now,
	}
}

func (l *tokenLimiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	b := l.buckets[key]
	if b == nil {
		b = &bucket{tokens: l.burst, updated: now}
		l.buckets[key] = b
	}
	if now.Sub(b.updated) > l.idle {
		b.tokens = l.burst
		b.updated = now
	}
	b.tokens += now.Sub(b.updated).Seconds() * l.rate
	if b.tokens > l.burst {
		b.tokens = l.burst
	}
	b.updated = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// rateLimitByClientIP returns a gin middleware allowing requestsPerMinute
// requests per client (per burst-minute bucket) before answering 429.
// The client identity is the real TCP peer (X-Forwarded-For is ignored on
// purpose: it is trivially spoofable and would defeat the limiter).
func rateLimitByClientIP(requestsPerMinute int, burst float64) gin.HandlerFunc {
	l := newTokenLimiter(requestsPerMinute, burst)
	return func(c *gin.Context) {
		key := c.RemoteIP()
		if key == "" {
			key = "unknown"
		}
		if !l.allow(key) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "rate limit exceeded, please slow down",
			})
			return
		}
		c.Next()
	}
}
