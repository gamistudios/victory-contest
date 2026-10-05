package main

import (
	"context"
	"log"

	"github.com/joho/godotenv"
	"victory-contest-go/internal/awsconfig"
	"victory-contest-go/internal/schema"
)

// setup-tables provisions the DynamoDB schema on demand: every table the
// repositories touch is created when missing (missing GSIs are added to
// existing ones), waiting for each change to become ACTIVE. The HTTP server
// runs the same migration at startup — this command exists for manual runs
// and pre-provisioning.
func main() {
	_ = godotenv.Load()
	// Single shared AWS config (issue #45): same loader/region/retry policy
	// the HTTP server uses.
	cfg, err := awsconfig.Load(context.Background())
	if err != nil {
		log.Fatalf("load config: %v", err)
	}
	client := awsconfig.DynamoClient(cfg)

	log.Print("provisioning DynamoDB schema (missing tables are created, missing GSIs are added)...")
	created, err := schema.EnsureTables(context.Background(), client, schema.Tables)
	if err != nil {
		log.Fatalf("migration incomplete (created so far: %v): %v", created, err)
	}
	if len(created) == 0 {
		log.Print("all tables already provisioned")
	} else {
		log.Printf("created tables: %v", created)
	}
	log.Print("all tables ready")
}
