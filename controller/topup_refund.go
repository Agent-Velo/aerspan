package controller

import (
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
	"github.com/stripe/stripe-go/v81"
	checkoutsession "github.com/stripe/stripe-go/v81/checkout/session"
	striperefund "github.com/stripe/stripe-go/v81/refund"
	"gorm.io/gorm"
)

type TopUpRefundRequest struct {
	Id int `json:"id"`
}

type topUpRefundGrantSnapshot struct {
	Quota       int
	CreatedTime int64
	ExpiredTime int64
	Reference   string
	Remark      string
	CreatedBy   int
}

func getStripePaymentIntentIDForRefund(tradeNo string) (string, error) {
	if tradeNo == "" {
		return "", errors.New("missing order number")
	}
	if strings.HasPrefix(tradeNo, "pi_") {
		return tradeNo, nil
	}
	if strings.HasPrefix(tradeNo, "cs_") {
		params := &stripe.CheckoutSessionParams{}
		params.AddExpand("payment_intent")
		s, err := checkoutsession.Get(tradeNo, params)
		if err != nil {
			return "", err
		}
		if s.PaymentIntent == nil || s.PaymentIntent.ID == "" {
			return "", errors.New("missing payment_intent in checkout session")
		}
		return s.PaymentIntent.ID, nil
	}
	return "", errors.New("unsupported order number")
}

func createStripeRefundForTopUp(topUpID int, userID int, tradeNo string) (*stripe.Refund, error) {
	if !strings.HasPrefix(setting.StripeApiSecret, "sk_") && !strings.HasPrefix(setting.StripeApiSecret, "rk_") {
		return nil, errors.New("Stripe is not configured")
	}
	stripe.Key = setting.StripeApiSecret

	piID, err := getStripePaymentIntentIDForRefund(tradeNo)
	if err != nil {
		return nil, err
	}

	params := &stripe.RefundParams{
		PaymentIntent: stripe.String(piID),
		Reason:        stripe.String(string(stripe.RefundReasonRequestedByCustomer)),
		Metadata: map[string]string{
			"topup_id":  strconv.Itoa(topUpID),
			"user_id":   strconv.Itoa(userID),
			"trade_no":  tradeNo,
			"requested": "self_service",
		},
	}
	params.SetIdempotencyKey(fmt.Sprintf("topup_refund_%d", topUpID))
	return striperefund.New(params)
}

func refundTopUpDeductCreditsTx(tx *gorm.DB, userId int, topUp *model.TopUp, now int64) (deducted int, grantSnapshot []topUpRefundGrantSnapshot, err error) {
	paidAt := topUp.CompleteTime
	if paidAt == 0 {
		paidAt = topUp.CreateTime
	}
	if paidAt == 0 {
		return 0, nil, errors.New("missing payment time")
	}
	if now-paidAt > topUpRefundWindowSeconds {
		return 0, nil, errors.New("refund window expired")
	}

	var user model.User
	if err := tx.Set("gorm:query_option", "FOR UPDATE").Select("id", "quota", "quota_expires_at").First(&user, userId).Error; err != nil {
		return 0, nil, err
	}

	var grants []model.CreditGrant
	if err := tx.Set("gorm:query_option", "FOR UPDATE").
		Where("user_id = ? AND grant_type = ? AND reference = ?", userId, "topup", topUp.TradeNo).
		Find(&grants).Error; err != nil {
		return 0, nil, err
	}
	if len(grants) == 0 {
		return 0, nil, errors.New("credits not found")
	}

	totalQuota := 0
	snapshots := make([]topUpRefundGrantSnapshot, 0, len(grants))
	for _, g := range grants {
		if g.UsedQuota != 0 {
			return 0, nil, errors.New("credits already used")
		}
		if g.Quota <= 0 {
			return 0, nil, errors.New("invalid credit grant")
		}
		totalQuota += g.Quota
		snapshots = append(snapshots, topUpRefundGrantSnapshot{
			Quota:       g.Quota,
			CreatedTime: g.CreatedTime,
			ExpiredTime: g.ExpiredTime,
			Reference:   g.Reference,
			Remark:      g.Remark,
			CreatedBy:   g.CreatedBy,
		})
	}
	if totalQuota <= 0 {
		return 0, nil, errors.New("invalid credit grant")
	}
	if user.Quota < totalQuota {
		return 0, nil, errors.New("quota is inconsistent")
	}

	if err := tx.Where("user_id = ? AND grant_type = ? AND reference = ?", userId, "topup", topUp.TradeNo).
		Delete(&model.CreditGrant{}).Error; err != nil {
		return 0, nil, err
	}

	var next sql.NullInt64
	if err := tx.Model(&model.CreditGrant{}).
		Where("user_id = ? AND expired_time != 0 AND quota > used_quota", userId).
		Select("MIN(expired_time)").
		Scan(&next).Error; err != nil {
		return 0, nil, err
	}
	newExpiresAt := int64(0)
	if next.Valid {
		newExpiresAt = next.Int64
	}

	if err := tx.Model(&model.User{}).Where("id = ?", userId).
		Updates(map[string]any{"quota": user.Quota - totalQuota, "quota_expires_at": newExpiresAt}).Error; err != nil {
		return 0, nil, err
	}

	topUp.Status = common.TopUpStatusRefundPending
	if err := tx.Save(topUp).Error; err != nil {
		return 0, nil, err
	}

	return totalQuota, snapshots, nil
}

func restoreTopUpCreditsTx(tx *gorm.DB, userId int, topUp *model.TopUp, snapshots []topUpRefundGrantSnapshot, now int64) error {
	for _, s := range snapshots {
		_, err := model.CreateCreditGrantTx(tx, model.CreateCreditGrantParams{
			UserId:      userId,
			Quota:       s.Quota,
			GrantType:   "topup",
			Reference:   s.Reference,
			Remark:      s.Remark,
			CreatedBy:   s.CreatedBy,
			CreatedTime: s.CreatedTime,
			ExpiredTime: s.ExpiredTime,
		})
		if err != nil {
			return err
		}
	}
	_ = now
	topUp.Status = common.TopUpStatusSuccess
	return tx.Save(topUp).Error
}

func RefundTopUpSelf(c *gin.Context) {
	userId := c.GetInt("id")
	if userId <= 0 {
		common.ApiErrorMsg(c, "Invalid user id")
		return
	}
	var req TopUpRefundRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Id <= 0 {
		common.ApiErrorMsg(c, "Invalid parameters")
		return
	}

	now := common.GetTimestamp()
	var topUp model.TopUp
	var didDeduct bool
	var grantSnapshot []topUpRefundGrantSnapshot

	err := model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Set("gorm:query_option", "FOR UPDATE").
			Where("id = ? AND user_id = ?", req.Id, userId).
			First(&topUp).Error; err != nil {
			return errors.New("invoice not found")
		}
		if topUp.PaymentMethod != PaymentMethodStripe {
			return errors.New("only Stripe payments can be refunded")
		}
		switch topUp.Status {
		case common.TopUpStatusRefunded:
			return nil
		case common.TopUpStatusRefundPending:
			return nil
		case common.TopUpStatusSuccess:
			// continue
		default:
			return errors.New("only successful payments can be refunded")
		}

		if topUp.Status == common.TopUpStatusSuccess {
			_, snapshot, err := refundTopUpDeductCreditsTx(tx, userId, &topUp, now)
			if err != nil {
				return err
			}
			didDeduct = true
			grantSnapshot = snapshot
		}
		return nil
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if topUp.Status == common.TopUpStatusRefunded {
		common.ApiSuccess(c, gin.H{"status": common.TopUpStatusRefunded})
		return
	}

	ref, err := createStripeRefundForTopUp(topUp.Id, userId, topUp.TradeNo)
	if err != nil {
		if didDeduct {
			_ = model.DB.Transaction(func(tx *gorm.DB) error {
				var locked model.TopUp
				if err := tx.Set("gorm:query_option", "FOR UPDATE").
					Where("id = ? AND user_id = ?", req.Id, userId).
					First(&locked).Error; err != nil {
					return nil
				}
				if locked.Status != common.TopUpStatusRefundPending {
					return nil
				}
				return restoreTopUpCreditsTx(tx, userId, &locked, grantSnapshot, now)
			})
		}
		common.ApiError(c, fmt.Errorf("refund failed: %w", err))
		return
	}

	if err := model.DB.Model(&model.TopUp{}).
		Where("id = ? AND user_id = ?", topUp.Id, userId).
		Update("status", common.TopUpStatusRefunded).Error; err != nil {
		common.ApiError(c, err)
		return
	}

	model.RecordLog(userId, model.LogTypeRefund, fmt.Sprintf("Self refund: invoice #%d (%s) refund_id=%s", topUp.Id, topUp.TradeNo, ref.ID))
	common.ApiSuccess(c, gin.H{"refund_id": ref.ID})
}
