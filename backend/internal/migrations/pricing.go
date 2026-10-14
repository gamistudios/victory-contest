package migrations

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"victory-contest-go/internal/domain"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

// PricingOptions configures the default plan. Etb (whole birr) is REQUIRED:
// no price is ever invented.
type PricingOptions struct {
	Table     string
	Etb       int64
	Days      int
	UpdatedBy string
}

// MigratePricing seeds one "All access" plan when price_plans is empty.
func MigratePricing(ctx context.Context, env Env, o PricingOptions) (Result, error) {
	if o.Table == "" {
		o.Table = "price_plans"
	}
	if o.Days <= 0 {
		o.Days = 30
	}
	if o.UpdatedBy == "" {
		o.UpdatedBy = "migrations"
	}
	if o.Etb <= 0 {
		return Result{}, fmt.Errorf("price in ETB (whole birr) is required; none is invented")
	}
	out, err := env.DB.Scan(ctx, &dynamodb.ScanInput{TableName: aws.String(o.Table), Limit: aws.Int32(1)})
	if err != nil {
		return Result{}, err
	}
	if len(out.Items) > 0 {
		return Result{Summary: "price_plans is not empty - nothing to do"}, nil
	}
	plan := domain.PricePlan{
		ID: "all-access-default", Name: "All access", AllPrograms: true,
		Validity: domain.Validity{Type: domain.ValidityDays, Days: o.Days},
		Prices:   []domain.Money{{Currency: domain.CurrencyETB, Amount: o.Etb}},
		IsActive: true, UpdatedBy: o.UpdatedBy, UpdatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	if !env.Apply {
		return Result{Summary: fmt.Sprintf("would create plan %q (nothing written)", plan.ID)}, nil
	}
	item, err := attributevalue.MarshalMap(plan)
	if err != nil {
		return Result{}, err
	}
	if _, err := env.DB.PutItem(ctx, &dynamodb.PutItemInput{TableName: aws.String(o.Table), Item: item,
		ConditionExpression: aws.String("attribute_not_exists(id)")}); err != nil {
		return Result{}, err
	}
	return Result{Summary: "created plan " + plan.ID}, nil
}

func envPricing(env Env) (PricingOptions, bool, error) {
	raw := env.Getenv("MIGRATE_PRICING_ETB")
	if raw == "" {
		return PricingOptions{}, false, nil
	}
	etb, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || etb <= 0 {
		return PricingOptions{}, true, fmt.Errorf("MIGRATE_PRICING_ETB=%q must be a positive integer of whole ETB (birr)", raw)
	}
	days := 30
	if d := env.Getenv("MIGRATE_PRICING_DAYS"); d != "" {
		if v, err := strconv.Atoi(d); err == nil && v > 0 {
			days = v
		}
	}
	return PricingOptions{Etb: etb, Days: days, UpdatedBy: "auto-migration"}, true, nil
}
