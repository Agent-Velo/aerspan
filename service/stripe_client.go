package service

import (
	"errors"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"

	"github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/customer"
	"github.com/stripe/stripe-go/v81/price"
)

var stripeCurrencyCache = struct {
	sync.Mutex
	value        string
	lastFetched  time.Time
	lastPriceID  string
	lastOverride string
}{}

func ValidateStripeSecretKey() error {
	if setting.StripeApiSecret == "" {
		return errors.New("Stripe API secret is not configured")
	}
	if !strings.HasPrefix(setting.StripeApiSecret, "sk_") && !strings.HasPrefix(setting.StripeApiSecret, "rk_") {
		return errors.New("invalid Stripe API key")
	}
	stripe.Key = setting.StripeApiSecret
	return nil
}

func ValidateStripeElementsConfig() error {
	if err := ValidateStripeSecretKey(); err != nil {
		return err
	}
	if setting.StripeWebhookSecret == "" {
		return errors.New("Stripe webhook secret is not configured")
	}
	if setting.StripePublishableKey == "" {
		return errors.New("Stripe publishable key is not configured")
	}
	if !strings.HasPrefix(setting.StripePublishableKey, "pk_") {
		return errors.New("invalid Stripe publishable key")
	}
	return nil
}

func StripeCurrency() string {
	override := strings.ToLower(strings.TrimSpace(setting.StripeCurrency))
	if override != "" {
		return override
	}

	// Best-effort inference for backwards compatibility: reuse the currency of the existing Stripe Price.
	stripeCurrencyCache.Lock()
	defer stripeCurrencyCache.Unlock()
	if setting.StripePriceId == "" {
		return "usd"
	}
	if stripeCurrencyCache.value != "" &&
		stripeCurrencyCache.lastPriceID == setting.StripePriceId &&
		stripeCurrencyCache.lastOverride == override &&
		time.Since(stripeCurrencyCache.lastFetched) < 6*time.Hour {
		return stripeCurrencyCache.value
	}

	p, err := price.Get(setting.StripePriceId, nil)
	if err != nil {
		log.Printf("failed to infer Stripe currency from price %s: %v", setting.StripePriceId, err)
		return "usd"
	}
	cur := strings.ToLower(strings.TrimSpace(string(p.Currency)))
	if cur == "" {
		cur = "usd"
	}
	stripeCurrencyCache.value = cur
	stripeCurrencyCache.lastFetched = time.Now()
	stripeCurrencyCache.lastPriceID = setting.StripePriceId
	stripeCurrencyCache.lastOverride = override
	return cur
}

func EnsureStripeCustomerForUser(user *model.User) (string, error) {
	if user.StripeCustomer != "" {
		return user.StripeCustomer, nil
	}
	if err := ValidateStripeSecretKey(); err != nil {
		return "", err
	}

	params := &stripe.CustomerParams{}
	if user.Email != "" {
		params.Email = stripe.String(user.Email)
	}
	params.AddMetadata("user_id", strconv.Itoa(user.Id))

	cus, err := customer.New(params)
	if err != nil {
		return "", err
	}

	user.StripeCustomer = cus.ID
	if err := user.Update(false); err != nil {
		return "", err
	}
	return cus.ID, nil
}
