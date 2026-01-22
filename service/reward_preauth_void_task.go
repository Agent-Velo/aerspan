package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/paymentintent"
)

const (
	rewardPreauthVoidTickInterval = 30 * time.Minute
	rewardPreauthVoidBatchSize    = 200
)

var (
	rewardPreauthVoidOnce    sync.Once
	rewardPreauthVoidRunning atomic.Bool
)

func StartRewardPreauthAutoVoidTask() {
	rewardPreauthVoidOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		gopool.Go(func() {
			ctx := context.Background()
			logger.LogInfo(ctx, fmt.Sprintf("reward preauth auto-void task started: tick=%s", rewardPreauthVoidTickInterval))

			ticker := time.NewTicker(rewardPreauthVoidTickInterval)
			defer ticker.Stop()

			runRewardPreauthAutoVoidOnce(ctx)
			for range ticker.C {
				runRewardPreauthAutoVoidOnce(ctx)
			}
		})
	})
}

func runRewardPreauthAutoVoidOnce(ctx context.Context) {
	if !rewardPreauthVoidRunning.CompareAndSwap(false, true) {
		return
	}
	defer rewardPreauthVoidRunning.Store(false)

	if err := ValidateStripeSecretKey(); err != nil {
		// Stripe might not be configured in some deployments; skip silently.
		return
	}

	now := time.Now().Unix()
	var scanned, voided int
	for {
		claims, err := model.ListRewardClaimsDueForStripeVoid(now, rewardPreauthVoidBatchSize)
		if err != nil {
			logger.LogError(ctx, fmt.Sprintf("reward preauth auto-void: query failed: %v", err))
			return
		}
		if len(claims) == 0 {
			break
		}

		for _, claim := range claims {
			if claim == nil {
				continue
			}
			scanned++
			paymentIntentID := strings.TrimSpace(claim.StripePaymentIntent)
			if paymentIntentID == "" {
				continue
			}

			pi, err := paymentintent.Cancel(paymentIntentID, nil)
			if err != nil {
				var stripeErr *stripe.Error
				if errors.As(err, &stripeErr) {
					// Treat non-cancelable/unknown/missing intents as already voided.
					switch stripeErr.Code {
					case stripe.ErrorCodeIntentInvalidState, stripe.ErrorCodeResourceMissing:
						_ = model.MarkRewardClaimStripeVoided(claim.Id, now, string(stripeErr.Code))
						continue
					}
				}
				logger.LogWarn(ctx, fmt.Sprintf("reward preauth auto-void: cancel failed: claim_id=%d payment_intent=%s err=%v", claim.Id, paymentIntentID, err))
				continue
			}

			voided++
			status := "canceled"
			if pi != nil {
				status = string(pi.Status)
			}
			if err := model.MarkRewardClaimStripeVoided(claim.Id, now, status); err != nil {
				logger.LogWarn(ctx, fmt.Sprintf("reward preauth auto-void: mark voided failed: claim_id=%d err=%v", claim.Id, err))
			}
		}
	}

	if common.DebugEnabled && (scanned > 0 || voided > 0) {
		logger.LogDebug(ctx, "reward preauth auto-void: scanned=%d voided=%d", scanned, voided)
	}
}

