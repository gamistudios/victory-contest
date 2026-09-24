// Package awsconfig is the single place in this module where the AWS SDK
// configuration is loaded and service clients are built (issue #45).
//
// Before this package, every repository constructor called
// config.LoadDefaultConfig on its own, which duplicated credential
// resolution, region selection and retry policy in ~17 places. The HTTP
// server (internal/handler/http.NewServer) and cmd/setup-tables now share
// this one configuration path: load the config once, build the DynamoDB
// client once, and inject it into the repositories.
//
// It also owns the per-call timeout budget for AWS requests (issue #46):
// every DynamoDB call site must derive its context through CallCtx so no
// unbounded network request can block a handler, the bot, or a cron path.
package awsconfig

import (
	"context"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

const (
	// DefaultRegion is used when AWS_REGION is unset.
	DefaultRegion = "eu-north-1"

	// RetryMaxAttempts bounds SDK-level retries for a single request.
	RetryMaxAttempts = 3

	// CallTimeout bounds every individual AWS call path (retries included).
	// Server-side code derives a per-call context with this timeout via
	// CallCtx, so a hung AWS request can never outlive the call site.
	CallTimeout = 15 * time.Second
)

// Load builds the one aws.Config used by the whole application. It reads
// AWS_REGION/AWS_ENDPOINT_URL_DYNAMODB from the environment (the endpoint
// variable is honored natively by LoadDefaultConfig) and pins a bounded
// retry policy.
func Load(ctx context.Context) (aws.Config, error) {
	region := os.Getenv("AWS_REGION")
	if region == "" {
		region = DefaultRegion
	}
	return config.LoadDefaultConfig(ctx,
		config.WithRegion(region),
		config.WithRetryMaxAttempts(RetryMaxAttempts),
	)
}

// DynamoClient builds the shared DynamoDB client from the single aws.Config.
// Callers construct it once and inject it into every repository.
func DynamoClient(cfg aws.Config) *dynamodb.Client {
	return dynamodb.NewFromConfig(cfg)
}

// CallCtx derives a bounded context for a single AWS call path. When parent
// is nil (bot/webhook/cron style server paths that have no request context)
// it derives from context.Background() so calls are still time-bounded.
func CallCtx(parent context.Context) (context.Context, context.CancelFunc) {
	if parent == nil {
		parent = context.Background()
	}
	return context.WithTimeout(parent, CallTimeout)
}
