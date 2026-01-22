package controller

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/paymentintent"
	"github.com/stripe/stripe-go/v81/paymentmethod"
	"gorm.io/gorm"
)

type rewardStatusResponse struct {
	Eligible            bool   `json:"eligible"`
	Pending             bool   `json:"pending"`
	Claimed             bool   `json:"claimed"`
	SignupQuota         int    `json:"signup_quota"`
	InviteeQuota        int    `json:"invitee_quota"`
	InviterAffQuota     int    `json:"inviter_aff_quota"`
	TotalQuota          int    `json:"total_quota"`
	StripePreauthAmount int64  `json:"stripe_preauth_amount"`
	StripeCurrency      string `json:"stripe_currency"`
	PaymentIntentID     string `json:"payment_intent_id,omitempty"`
	PaymentIntentStatus string `json:"payment_intent_status,omitempty"`
	VoidAfter           int64  `json:"void_after,omitempty"`
	VoidedTime          int64  `json:"voided_time,omitempty"`
}

type rewardClaimResponse struct {
	ClaimStatus         string `json:"claim_status"`
	GrantedQuota        int    `json:"granted_quota,omitempty"`
	SignupQuota         int    `json:"signup_quota,omitempty"`
	InviteeQuota        int    `json:"invitee_quota,omitempty"`
	InviterAffQuota     int    `json:"inviter_aff_quota,omitempty"`
	PaymentIntentID     string `json:"payment_intent_id,omitempty"`
	PaymentIntentStatus string `json:"payment_intent_status,omitempty"`
	ClientSecret        string `json:"client_secret,omitempty"`
	VoidAfter           int64  `json:"void_after,omitempty"`
}

func GetRewardStatus(c *gin.Context) {
	userID := c.GetInt("id")
	claim, err := model.GetRewardClaimByUserId(userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			common.ApiSuccess(c, rewardStatusResponse{
				Eligible:            false,
				Pending:             false,
				Claimed:             false,
				SignupQuota:         0,
				InviteeQuota:        0,
				InviterAffQuota:     0,
				TotalQuota:          0,
				StripePreauthAmount: service.RewardPreauthAmountMinorUnits(),
				StripeCurrency:      service.StripeCurrency(),
			})
			return
		}
		common.ApiError(c, err)
		return
	}

	totalQuota := claim.SignupQuota + claim.InviteeQuota
	pending := claim.Status == model.RewardClaimStatusPending && (totalQuota > 0 || claim.InviterAffQuota > 0)
	claimed := claim.Status == model.RewardClaimStatusClaimed

	common.ApiSuccess(c, rewardStatusResponse{
		Eligible:            totalQuota > 0 || claim.InviterAffQuota > 0,
		Pending:             pending,
		Claimed:             claimed,
		SignupQuota:         claim.SignupQuota,
		InviteeQuota:        claim.InviteeQuota,
		InviterAffQuota:     claim.InviterAffQuota,
		TotalQuota:          totalQuota,
		StripePreauthAmount: service.RewardPreauthAmountMinorUnits(),
		StripeCurrency:      service.StripeCurrency(),
		PaymentIntentID:     strings.TrimSpace(claim.StripePaymentIntent),
		PaymentIntentStatus: strings.TrimSpace(claim.StripePaymentStatus),
		VoidAfter:           claim.StripeVoidAfter,
		VoidedTime:          claim.StripeVoidedTime,
	})
}

func ClaimReward(c *gin.Context) {
	userID := c.GetInt("id")
	user, err := model.GetUserById(userID, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	claim, err := model.GetRewardClaimByUserId(userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			common.ApiSuccess(c, rewardClaimResponse{ClaimStatus: "no_reward"})
			return
		}
		common.ApiError(c, err)
		return
	}

	totalQuota := claim.SignupQuota + claim.InviteeQuota
	if totalQuota <= 0 && claim.InviterAffQuota <= 0 {
		common.ApiSuccess(c, rewardClaimResponse{ClaimStatus: "no_reward"})
		return
	}
	if claim.Status == model.RewardClaimStatusClaimed {
		common.ApiSuccess(c, rewardClaimResponse{ClaimStatus: "claimed"})
		return
	}

	if err := service.ValidateStripeElementsConfig(); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	customerID, err := ensureStripeCustomerForUser(user)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	userSetting := user.GetSetting()
	defaultPaymentMethodID := strings.TrimSpace(userSetting.StripeDefaultPaymentMethodID)
	if defaultPaymentMethodID == "" {
		params := &stripe.PaymentMethodListParams{
			Customer: stripe.String(customerID),
			Type:     stripe.String("card"),
		}
		iter := paymentmethod.List(params)
		for iter.Next() {
			pm := iter.PaymentMethod()
			if pm == nil || pm.Card == nil {
				continue
			}
			defaultPaymentMethodID = pm.ID
			break
		}
		if err := iter.Err(); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	if defaultPaymentMethodID == "" {
		common.ApiErrorMsg(c, "No saved card. Please bind a card first")
		return
	}
	if !strings.HasPrefix(defaultPaymentMethodID, "pm_") {
		common.ApiErrorMsg(c, "Invalid payment method")
		return
	}

	pm, err := paymentmethod.Get(defaultPaymentMethodID, nil)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if pm.Customer == nil || pm.Customer.ID != customerID {
		common.ApiErrorMsg(c, "Payment method does not belong to this customer")
		return
	}

	pi, err := getOrCreateRewardPreauthPaymentIntent(userID, customerID, defaultPaymentMethodID, claim)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	piStatus := ""
	clientSecret := ""
	if pi != nil {
		piStatus = string(pi.Status)
		clientSecret = pi.ClientSecret
	}

	if pi != nil && pi.Status == stripe.PaymentIntentStatusRequiresAction && clientSecret != "" {
		common.ApiSuccess(c, rewardClaimResponse{
			ClaimStatus:         "requires_action",
			SignupQuota:         claim.SignupQuota,
			InviteeQuota:        claim.InviteeQuota,
			InviterAffQuota:     claim.InviterAffQuota,
			PaymentIntentID:     pi.ID,
			PaymentIntentStatus: piStatus,
			ClientSecret:        clientSecret,
			VoidAfter:           claim.StripeVoidAfter,
		})
		return
	}

	if pi == nil || (pi.Status != stripe.PaymentIntentStatusRequiresCapture && pi.Status != stripe.PaymentIntentStatusSucceeded) {
		status := piStatus
		if status == "" {
			status = "unknown"
		}
		common.ApiErrorMsg(c, "Pre-authorization not completed: status="+status)
		return
	}

	grantedQuota, err := grantRewardClaim(userID)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, rewardClaimResponse{
		ClaimStatus:         "claimed",
		GrantedQuota:        grantedQuota,
		SignupQuota:         claim.SignupQuota,
		InviteeQuota:        claim.InviteeQuota,
		InviterAffQuota:     claim.InviterAffQuota,
		PaymentIntentID:     pi.ID,
		PaymentIntentStatus: piStatus,
		VoidAfter:           claim.StripeVoidAfter,
	})
}

func getOrCreateRewardPreauthPaymentIntent(userID int, customerID string, paymentMethodID string, claim *model.RewardClaim) (*stripe.PaymentIntent, error) {
	if claim == nil {
		return nil, errors.New("claim is nil")
	}
	if err := service.ValidateStripeSecretKey(); err != nil {
		return nil, err
	}

	now := time.Now().Unix()
	piID := strings.TrimSpace(claim.StripePaymentIntent)
	if piID != "" {
		pi, err := paymentintent.Get(piID, nil)
		if err == nil {
			if pi == nil {
				return nil, errors.New("stripe payment intent is nil")
			}
			// If it's already canceled (e.g. by the auto-void task), create a new one.
			if pi.Status != stripe.PaymentIntentStatusCanceled && claim.StripeVoidedTime == 0 {
				_ = model.DB.Model(&model.RewardClaim{}).
					Where("id = ?", claim.Id).
					Updates(map[string]any{
						"stripe_payment_intent_status": string(pi.Status),
					}).Error
				claim.StripePaymentStatus = string(pi.Status)
				return pi, nil
			}
		} else {
			var stripeErr *stripe.Error
			if !errors.As(err, &stripeErr) || stripeErr.Code != stripe.ErrorCodeResourceMissing {
				return nil, err
			}
		}
	}

	attempt := claim.StripePreauthAttempt
	if piID != "" || claim.StripeVoidedTime != 0 {
		attempt++
	}

	pi, err := service.CreateRewardPreauthPaymentIntent(userID, claim.Id, attempt, customerID, paymentMethodID)
	if err != nil {
		return nil, err
	}
	if pi == nil {
		return nil, errors.New("failed to create payment intent")
	}

	voidAfter := now + int64(service.RewardPreauthVoidDelay().Seconds())
	if err := model.DB.Model(&model.RewardClaim{}).
		Where("id = ?", claim.Id).
		Updates(map[string]any{
			"stripe_preauth_attempt":      attempt,
			"stripe_payment_intent_id":     pi.ID,
			"stripe_payment_intent_status": string(pi.Status),
			"stripe_void_after":           voidAfter,
			"stripe_voided_time":          int64(0),
		}).Error; err != nil {
		return nil, err
	}
	claim.StripePreauthAttempt = attempt
	claim.StripePaymentIntent = pi.ID
	claim.StripePaymentStatus = string(pi.Status)
	claim.StripeVoidAfter = voidAfter
	claim.StripeVoidedTime = 0
	return pi, nil
}

func grantRewardClaim(userID int) (int, error) {
	now := common.GetTimestamp()
	var grantedQuota int
	var inviterID int
	var inviterAffQuota int
	var signupQuota int
	var inviteeQuota int

	err := model.DB.Transaction(func(tx *gorm.DB) error {
		claim, err := model.GetRewardClaimByUserIdForUpdateTx(tx, userID)
		if err != nil {
			return err
		}
		if claim.Status == model.RewardClaimStatusClaimed {
			return nil
		}

		signupQuota = claim.SignupQuota
		inviteeQuota = claim.InviteeQuota
		inviterID = claim.InviterId
		inviterAffQuota = claim.InviterAffQuota
		grantedQuota = 0

		if signupQuota > 0 {
			if _, err := model.CreateCreditGrantTx(tx, model.CreateCreditGrantParams{
				UserId:      userID,
				Quota:       signupQuota,
				GrantType:   "signup",
				Reference:   "signup:" + strconv.Itoa(userID),
				Remark:      "sign-up bonus",
				CreatedTime: now,
				ExpiredTime: 0,
			}); err != nil {
				return err
			}
			grantedQuota += signupQuota
		}
		if inviteeQuota > 0 && inviterID != 0 {
			if _, err := model.CreateCreditGrantTx(tx, model.CreateCreditGrantParams{
				UserId:      userID,
				Quota:       inviteeQuota,
				GrantType:   "invite_bonus",
				Reference:   "invite_bonus:" + strconv.Itoa(inviterID),
				Remark:      "invite code bonus",
				CreatedTime: now,
				ExpiredTime: 0,
			}); err != nil {
				return err
			}
			grantedQuota += inviteeQuota
		}

		if inviterID != 0 && inviterAffQuota > 0 {
			var inviter model.User
			if err := tx.Set("gorm:query_option", "FOR UPDATE").First(&inviter, inviterID).Error; err == nil {
				inviter.AffCount++
				inviter.AffQuota += inviterAffQuota
				inviter.AffHistoryQuota += inviterAffQuota
				if err := tx.Save(&inviter).Error; err != nil {
					return err
				}
			}
		}

		return tx.Model(&model.RewardClaim{}).
			Where("id = ?", claim.Id).
			Updates(map[string]any{
				"status":      model.RewardClaimStatusClaimed,
				"claimed_time": now,
			}).Error
	})
	if err != nil {
		return 0, err
	}

	if grantedQuota > 0 {
		if signupQuota > 0 {
			model.RecordLog(userID, model.LogTypeSystem, "Sign-up bonus: "+logger.LogQuota(signupQuota))
		}
		if inviteeQuota > 0 {
			model.RecordLog(userID, model.LogTypeSystem, "Invite code bonus: "+logger.LogQuota(inviteeQuota))
		}
	}
	if inviterID != 0 && inviterAffQuota > 0 {
		model.RecordLog(inviterID, model.LogTypeSystem, "Referral bonus: "+logger.LogQuota(inviterAffQuota))
	}

	return grantedQuota, nil
}
