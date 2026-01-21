package service

import (
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/shopspring/decimal"
	"github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/paymentintent"
	"github.com/thanhpk/randstr"
)

var stripeAutoTopupLocks sync.Map
var stripeAutoTopupCreateLock sync.Mutex

type stripeAutoTopupTryLock struct {
	ch chan struct{}
}

func newStripeAutoTopupTryLock() *stripeAutoTopupTryLock {
	return &stripeAutoTopupTryLock{ch: make(chan struct{}, 1)}
}

func (l *stripeAutoTopupTryLock) TryLock() bool {
	select {
	case l.ch <- struct{}{}:
		return true
	default:
		return false
	}
}

func (l *stripeAutoTopupTryLock) Unlock() {
	select {
	case <-l.ch:
	default:
	}
}

func getStripeAutoTopupLock(userID int) *stripeAutoTopupTryLock {
	if v, ok := stripeAutoTopupLocks.Load(userID); ok {
		return v.(*stripeAutoTopupTryLock)
	}
	stripeAutoTopupCreateLock.Lock()
	defer stripeAutoTopupCreateLock.Unlock()
	if v, ok := stripeAutoTopupLocks.Load(userID); ok {
		return v.(*stripeAutoTopupTryLock)
	}
	l := newStripeAutoTopupTryLock()
	stripeAutoTopupLocks.Store(userID, l)
	return l
}

func stripeAutoTopupThresholdQuotaPoints(threshold int64) int {
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		return int(threshold)
	}
	return int(float64(threshold) * common.QuotaPerUnit)
}

func maybeTriggerStripeAutoTopup(relayInfo *relaycommon.RelayInfo, newQuota int) {
	if relayInfo == nil {
		return
	}
	// Do not auto-charge during channel tests.
	if relayInfo.IsChannelTest {
		return
	}
	userSetting := relayInfo.UserSetting
	if !userSetting.StripeAutoTopUpEnabled {
		return
	}
	if userSetting.StripeAutoTopUpThreshold <= 0 || userSetting.StripeAutoTopUpAmount <= 0 {
		return
	}
	if userSetting.StripeAutoTopUpAmount > 10000 {
		return
	}
	if userSetting.StripeAutoTopUpAmount < StripeMinTopup() {
		return
	}

	thresholdQuota := stripeAutoTopupThresholdQuotaPoints(userSetting.StripeAutoTopUpThreshold)
	if newQuota >= thresholdQuota {
		return
	}
	if setting.StripeApiSecret == "" {
		return
	}

	gopool.Go(func() {
		tryStripeAutoTopup(relayInfo.UserId, thresholdQuota, userSetting.StripeAutoTopUpAmount, userSetting.StripeAutoTopUpPaymentMethodID, userSetting.StripeDefaultPaymentMethodID)
	})
}

func tryStripeAutoTopup(userID int, thresholdQuota int, amount int64, autoPaymentMethodID string, defaultPaymentMethodID string) {
	lock := getStripeAutoTopupLock(userID)
	if !lock.TryLock() {
		return
	}
	defer lock.Unlock()

	// Avoid repeated charges when multiple requests happen in a short window.
	hasPending, err := model.HasRecentPendingTopUp(userID, "stripe", time.Now().Add(-10*time.Minute).Unix())
	if err == nil && hasPending {
		return
	}

	currentQuota, err := model.GetUserQuota(userID, false)
	if err == nil && currentQuota >= thresholdQuota {
		return
	}

	if err := ValidateStripeSecretKey(); err != nil {
		return
	}

	user, err := model.GetUserById(userID, false)
	if err != nil {
		return
	}

	customerID, err := EnsureStripeCustomerForUser(user)
	if err != nil {
		return
	}

	pmID := strings.TrimSpace(defaultPaymentMethodID)
	if pmID == "" || !strings.HasPrefix(pmID, "pm_") {
		return
	}

	payMoney := StripePayMoney(float64(amount), user.Group)
	if payMoney <= 0.01 {
		return
	}
	chargeMinorUnits := decimal.NewFromFloat(payMoney).Mul(decimal.NewFromInt(100)).Round(0).IntPart()
	if chargeMinorUnits <= 0 {
		return
	}

	chargedMoney := StripeChargedAmount(float64(amount), *user)
	if chargedMoney <= 0 {
		return
	}

	reference := fmt.Sprintf("new-api-auto-topup-%d-%d-%s", userID, time.Now().UnixMilli(), randstr.String(4))
	referenceID := "ref_" + common.Sha1([]byte(reference))

	topUp := &model.TopUp{
		UserId:        userID,
		Amount:        amount,
		Money:         chargedMoney,
		TradeNo:       referenceID,
		PaymentMethod: "stripe",
		CreateTime:    time.Now().Unix(),
		Status:        common.TopUpStatusPending,
	}
	if err := topUp.Insert(); err != nil {
		return
	}

	params := &stripe.PaymentIntentParams{
		Amount:   stripe.Int64(chargeMinorUnits),
		Currency: stripe.String(StripeCurrency()),
		Customer: stripe.String(customerID),
		PaymentMethodTypes: []*string{
			stripe.String("card"),
		},
		PaymentMethod: stripe.String(pmID),
		Confirm:       stripe.Bool(true),
		OffSession:    stripe.Bool(true),
		// Auto top-up cannot handle SCA challenges; fail fast.
		ErrorOnRequiresAction: stripe.Bool(true),
		Description:           stripe.String(fmt.Sprintf("Auto top-up %s", referenceID)),
		Metadata: map[string]string{
			"reference_id": referenceID,
			"user_id":      fmt.Sprintf("%d", userID),
			"auto_topup":   "true",
		},
	}
	params.SetIdempotencyKey(referenceID)

	pi, err := paymentintent.New(params)
	if err != nil {
		topUp.Status = common.TopUpStatusFailed
		_ = topUp.Update()
		maybeDisableAutoTopupOnStripeError(user, err)
		return
	}

	if pi.ID != "" {
		topUp.TradeNo = pi.ID
		if err := topUp.Update(); err != nil {
			log.Printf("failed to update auto top-up trade_no to PaymentIntent ID: %v", err)
		}
	}
	tradeNo := topUp.TradeNo

	if pi.Status == stripe.PaymentIntentStatusSucceeded {
		if err := model.Recharge(tradeNo, customerID); err != nil {
			// Fallback for a tiny race: webhook might have completed with legacy reference_id.
			if referenceID != "" {
				_ = model.Recharge(referenceID, customerID)
			}
		}
	}
}

func maybeDisableAutoTopupOnStripeError(user *model.User, err error) {
	stripeErr, ok := err.(*stripe.Error)
	if !ok {
		return
	}
	if stripeErr.Code != stripe.ErrorCodeAuthenticationRequired && stripeErr.DeclineCode != stripe.DeclineCodeAuthenticationRequired {
		return
	}

	currentSetting := user.GetSetting()
	if !currentSetting.StripeAutoTopUpEnabled {
		return
	}
	currentSetting.StripeAutoTopUpEnabled = false
	user.SetSetting(currentSetting)
	if err := user.Update(false); err != nil {
		log.Printf("failed to disable Stripe auto top-up after authentication_required: %v", err)
	}
}
