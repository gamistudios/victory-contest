package main

import (
	"victory-contest-go/internal/handler/http"

	"os"

	"github.com/joho/godotenv"
)

func main() {
	godotenv.Load()
	server := http.NewServer()
	r := server.NewRouter()

	addr := ":8080"
	if p := os.Getenv("PORT"); p != "" {
		addr = ":" + p
	}
	r.Run(addr)
}
