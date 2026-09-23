package http

import "testing"

func TestIsOriginAllowed(t *testing.T) {
	tests := []struct {
		name      string
		origin    string
		allowlist []string
		want      bool
	}{
		// Dev default (allowlist unset): any localhost/127.0.0.1 port OK.
		{name: "dev: localhost vite port", origin: "http://localhost:5184", want: true},
		{name: "dev: localhost 5173", origin: "http://localhost:5173", want: true},
		{name: "dev: 127.0.0.1 any port", origin: "http://127.0.0.1:8000", want: true},
		{name: "dev: https localhost", origin: "https://localhost:5173", want: true},
		{name: "dev: localhost no port", origin: "http://localhost", want: true},
		// Dev default must reject everything else, especially devtunnels.
		{name: "dev: devtunnels subdomain rejected", origin: "https://7wwb0knl-5173.euw.devtunnels.ms", want: false},
		{name: "dev: random https rejected", origin: "https://victory-contest.vercel.app", want: false},
		{name: "dev: scheme prefix spoof rejected", origin: "http://localhost.evil.com:5173", want: false},
		{name: "dev: evil example.com rejected", origin: "https://evil.com", want: false},
		{name: "dev: empty origin rejected", origin: "", want: false},
		{name: "dev: non-url rejected", origin: "not a url", want: false},
		{name: "dev: javascript scheme rejected", origin: "javascript://localhost:5173", want: false},
		// Explicit allowlist: exact match only, dev ports no longer automatic.
		{name: "allowlist: exact match", origin: "https://victory-frontend.vercel.app",
			allowlist: []string{"https://victory-frontend.vercel.app"}, want: true},
		{name: "allowlist: case-insensitive match", origin: "HTTPS://Victory-Frontend.Vercel.App",
			allowlist: []string{"https://victory-frontend.vercel.app"}, want: true},
		{name: "allowlist: localhost not auto-allowed", origin: "http://localhost:5184",
			allowlist: []string{"https://victory-frontend.vercel.app"}, want: false},
		{name: "allowlist: devtunnels rejected", origin: "https://x-5173.euw.devtunnels.ms",
			allowlist: []string{"https://victory-frontend.vercel.app"}, want: false},
		{name: "allowlist: substring not enough", origin: "https://victory-frontend.vercel.app.evil.com",
			allowlist: []string{"https://victory-frontend.vercel.app"}, want: false},
		{name: "allowlist: missing port differs", origin: "http://localhost",
			allowlist: []string{"http://localhost:5184"}, want: false},
		{name: "allowlist: empty origin rejected", origin: "",
			allowlist: []string{"http://localhost:5184"}, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isOriginAllowed(tt.origin, tt.allowlist); got != tt.want {
				t.Errorf("isOriginAllowed(%q, %v) = %v, want %v", tt.origin, tt.allowlist, got, tt.want)
			}
		})
	}
}
