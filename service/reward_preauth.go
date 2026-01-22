package service

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/paymentintent"
)

const (
	// rewardPreauthAmountMinorUnits is $1.00 in a 2-decimal currency like USD.
	// This project assumes Stripe currencies use 2 decimals (see existing top-up logging).
	rewardPreauthAmountMinorUnits int64 = 100
)

func RewardPreauthAmountMinorUnits() int64 {
	return rewardPreauthAmountMinorUnits
}

func RewardPreauthVoidDelay() time.Duration {
	return 24 * time.Hour
}

func CreateRewardPreauthPaymentIntent(userID int, rewardClaimID int, attempt int, customerID string, paymentMethodID string) (*stripe.PaymentIntent, error) {
	if userID <= 0 {
		return nil, errors.New("invalid user id")
	}
	if rewardClaimID <= 0 {
		return nil, errors.New("invalid reward claim id")
	}
	if attempt < 0 {
		attempt = 0
	}
	customerID = strings.TrimSpace(customerID)
	paymentMethodID = strings.TrimSpace(paymentMethodID)
	if customerID == "" {
		return nil, errors.New("missing stripe customer")
	}
	if paymentMethodID == "" {
		return nil, errors.New("missing payment method")
	}

	if err := ValidateStripeElementsConfig(); err != nil {
		return nil, err
	}

	params := &stripe.PaymentIntentParams{
		Amount:        stripe.Int64(rewardPreauthAmountMinorUnits),
		Currency:      stripe.String(StripeCurrency()),
		Customer:      stripe.String(customerID),
		PaymentMethod: stripe.String(paymentMethodID),
		Confirm:       stripe.Bool(true),
		UseStripeSDK:  stripe.Bool(true),
		CaptureMethod: stripe.String(string(stripe.PaymentIntentCaptureMethodManual)),
		Description:   stripe.String(fmt.Sprintf("Reward card verification (claim %d, attempt %d)", rewardClaimID, attempt)),
		Metadata: map[string]string{
			"purpose":         "reward_preauth",
			"user_id":         strconv.Itoa(userID),
			"reward_claim_id": strconv.Itoa(rewardClaimID),
		},
	}
	params.SetIdempotencyKey(fmt.Sprintf("reward_preauth:%d:%d", rewardClaimID, attempt))

	pi, err := paymentintent.New(params)
	if err != nil {
		return nil, err
	}
	return pi, nil
}
