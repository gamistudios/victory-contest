package main

import (
	"os/signal"
	"syscall"
	"victory-contest-go/internal/handler/http"

	"os"

	"github.com/joho/godotenv"
)

func main() {
	godotenv.Load()
	server := http.NewServer()
	r := server.NewRouter()

	// Attempt expiry sweeper (plan §5.4.2); stops on SIGINT/SIGTERM.
	stop := make(chan struct{})
	go server.RunAttemptSweeper(stop)
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	go func() { <-sig; close(stop); os.Exit(0) }()

	addr := ":8080"
	if p := os.Getenv("PORT"); p != "" {
		addr = ":" + p
	}
	r.Run(addr)
}
