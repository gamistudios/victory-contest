package repository

import (
	"context"
	"fmt"
	"strings"
	"time"

	"victory-contest-go/internal/awsconfig"
	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// docStore is a tiny typed put/get/scan/delete helper shared by the three
// pricing tables (price_plans, coupons, entitlements). Tables are keyed by `id`.
type docStore[T any] struct {
	db    *dynamodb.Client
	table string
}

func (s docStore[T]) put(v T) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	item, err := attributevalue.MarshalMap(v)
	if err != nil {
		return err
	}
	_, err = s.db.PutItem(ctx, &dynamodb.PutItemInput{TableName: aws.String(s.table), Item: item})
	return err
}

func (s docStore[T]) get(id string) (*T, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	out, err := s.db.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(s.table),
		Key:       map[string]types.AttributeValue{"id": &types.AttributeValueMemberS{Value: id}},
	})
	if err != nil {
		return nil, err
	}
	if len(out.Item) == 0 {
		return nil, nil
	}
	var v T
	if err := attributevalue.UnmarshalMap(out.Item, &v); err != nil {
		return nil, err
	}
	return &v, nil
}

func (s docStore[T]) del(id string) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	_, err := s.db.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(s.table),
		Key:       map[string]types.AttributeValue{"id": &types.AttributeValueMemberS{Value: id}},
	})
	return err
}

func (s docStore[T]) scan() ([]T, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	var out []T
	var start map[string]types.AttributeValue
	for {
		res, err := s.db.Scan(ctx, &dynamodb.ScanInput{TableName: aws.String(s.table), ExclusiveStartKey: start})
		if err != nil {
			return nil, err
		}
		var page []T
		if err := attributevalue.UnmarshalListOfMaps(res.Items, &page); err != nil {
			return nil, err
		}
		out = append(out, page...)
		if len(res.LastEvaluatedKey) == 0 {
			return out, nil
		}
		start = res.LastEvaluatedKey
	}
}

// ---- price plans ----

type pricePlanRepo struct{ s docStore[domain.PricePlan] }

func NewPricePlanDynamoRepository(db *dynamodb.Client, table string) usecase.PricePlanRepository {
	return &pricePlanRepo{docStore[domain.PricePlan]{db, table}}
}
func (r *pricePlanRepo) Put(p domain.PricePlan) error             { return r.s.put(p) }
func (r *pricePlanRepo) Get(id string) (*domain.PricePlan, error) { return r.s.get(id) }
func (r *pricePlanRepo) Delete(id string) error                   { return r.s.del(id) }
func (r *pricePlanRepo) List() ([]domain.PricePlan, error)        { return r.s.scan() }

// ---- coupons ----

type couponRepo struct{ s docStore[domain.Coupon] }

func NewCouponDynamoRepository(db *dynamodb.Client, table string) usecase.CouponRepository {
	return &couponRepo{docStore[domain.Coupon]{db, table}}
}
func (r *couponRepo) Put(c domain.Coupon) error {
	c.Code = strings.ToUpper(strings.TrimSpace(c.Code))
	return r.s.put(c)
}
func (r *couponRepo) Get(id string) (*domain.Coupon, error) { return r.s.get(id) }
func (r *couponRepo) Delete(id string) error                { return r.s.del(id) }
func (r *couponRepo) List() ([]domain.Coupon, error)        { return r.s.scan() }

func (r *couponRepo) GetByCode(code string) (*domain.Coupon, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	all, err := r.s.scan() // coupon volume is tiny; avoids a GSI
	if err != nil {
		return nil, err
	}
	for i := range all {
		if strings.ToUpper(all[i].Code) == code {
			return &all[i], nil
		}
	}
	return nil, nil
}

// Redeem atomically bumps `redeemed`; it fails when max_redemptions is reached
// (race-free, unlike read-modify-write).
func (r *couponRepo) Redeem(id string, max int) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	in := &dynamodb.UpdateItemInput{
		TableName:        aws.String(r.s.table),
		Key:              map[string]types.AttributeValue{"id": &types.AttributeValueMemberS{Value: id}},
		UpdateExpression: aws.String("SET redeemed = if_not_exists(redeemed, :z) + :one"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":z": &types.AttributeValueMemberN{Value: "0"}, ":one": &types.AttributeValueMemberN{Value: "1"},
		},
		ConditionExpression: aws.String("attribute_exists(id)"),
	}
	if max > 0 {
		in.ConditionExpression = aws.String("attribute_exists(id) AND (attribute_not_exists(redeemed) OR redeemed < :max)")
		in.ExpressionAttributeValues[":max"] = &types.AttributeValueMemberN{Value: fmt.Sprint(max)}
	}
	_, err := r.s.db.UpdateItem(ctx, in)
	if err != nil {
		return usecase.ErrCouponExhausted
	}
	return nil
}

// Release atomically undoes one Redeem; the counter never goes below zero.
func (r *couponRepo) Release(id string) error {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	_, err := r.s.db.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:        aws.String(r.s.table),
		Key:              map[string]types.AttributeValue{"id": &types.AttributeValueMemberS{Value: id}},
		UpdateExpression: aws.String("SET redeemed = redeemed - :one"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":one": &types.AttributeValueMemberN{Value: "1"}, ":z": &types.AttributeValueMemberN{Value: "0"},
		},
		ConditionExpression: aws.String("attribute_exists(id) AND redeemed > :z"),
	})
	return err
}

// ---- entitlements ----

type entitlementRepo struct{ s docStore[domain.Entitlement] }

func NewEntitlementDynamoRepository(db *dynamodb.Client, table string) usecase.EntitlementRepository {
	return &entitlementRepo{docStore[domain.Entitlement]{db, table}}
}

func (r *entitlementRepo) ListByStudent(studentID string) ([]domain.Entitlement, error) {
	ctx, cancel := awsconfig.CallCtx(context.Background())
	defer cancel()
	items, err := queryPages(ctx, r.s.db, &dynamodb.QueryInput{
		TableName:                 aws.String(r.s.table),
		IndexName:                 aws.String("student_id-index"),
		KeyConditionExpression:    aws.String("student_id = :s"),
		ExpressionAttributeValues: map[string]types.AttributeValue{":s": &types.AttributeValueMemberS{Value: studentID}},
	})
	if err != nil {
		return nil, err
	}
	var out []domain.Entitlement
	return out, attributevalue.UnmarshalListOfMaps(items, &out)
}

// ReplaceForStudent writes the rebuilt set and deletes stale rows.
func (r *entitlementRepo) ReplaceForStudent(studentID string, es []domain.Entitlement) error {
	old, err := r.ListByStudent(studentID)
	if err != nil {
		return err
	}
	keep := map[string]bool{}
	for _, e := range es {
		keep[e.ID] = true
		if err := r.s.put(e); err != nil {
			return err
		}
	}
	for _, o := range old {
		if !keep[o.ID] {
			if err := r.s.del(o.ID); err != nil {
				return err
			}
		}
	}
	return nil
}

var _ = time.Now
