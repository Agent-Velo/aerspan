package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
)

const topUpRefundWindowSeconds = int64(24 * 60 * 60)

func GetTopUpInfo(c *gin.Context) {
	// 获取支付方式
	payMethods := operation_setting.PayMethods

	// 如果启用了 Stripe 支付，添加到支付方法列表
	if setting.StripeApiSecret != "" && setting.StripeWebhookSecret != "" && setting.StripePriceId != "" {
		// 检查是否已经包含 Stripe
		hasStripe := false
		for _, method := range payMethods {
			if method["type"] == "stripe" {
				hasStripe = true
				break
			}
		}

		if !hasStripe {
			stripeMethod := map[string]string{
				"name":      "Stripe",
				"type":      "stripe",
				"color":     "rgba(var(--semi-purple-5), 1)",
				"min_topup": strconv.Itoa(setting.StripeMinTopUp),
			}
			payMethods = append(payMethods, stripeMethod)
		}
	}

	data := gin.H{
		"enable_stripe_topup":          setting.StripeApiSecret != "" && setting.StripeWebhookSecret != "" && setting.StripePriceId != "",
		"enable_stripe_elements_topup": setting.StripeApiSecret != "" && setting.StripeWebhookSecret != "" && setting.StripePublishableKey != "",
		"stripe_publishable_key":       setting.StripePublishableKey,
		"stripe_currency":              setting.StripeCurrency,
		"pay_methods":                  payMethods,
		"stripe_min_topup":             setting.StripeMinTopUp,
		"amount_options":               operation_setting.GetPaymentSetting().AmountOptions,
		"discount":                     operation_setting.GetPaymentSetting().AmountDiscount,
	}
	common.ApiSuccess(c, data)
}

func GetUserTopUps(c *gin.Context) {
	userId := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)
	keyword := c.Query("keyword")

	var (
		topups []*model.TopUp
		total  int64
		err    error
	)
	if keyword != "" {
		topups, total, err = model.SearchUserTopUps(userId, keyword, pageInfo)
	} else {
		topups, total, err = model.GetUserTopUps(userId, pageInfo)
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}

	now := common.GetTimestamp()
	eligibleRefs := make([]string, 0, len(topups))
	for _, t := range topups {
		if t == nil {
			continue
		}
		if t.Status != common.TopUpStatusSuccess {
			continue
		}
		if t.PaymentMethod != PaymentMethodStripe {
			continue
		}
		paidAt := t.CompleteTime
		if paidAt == 0 {
			paidAt = t.CreateTime
		}
		if paidAt == 0 {
			continue
		}
		if now-paidAt > topUpRefundWindowSeconds {
			continue
		}
		eligibleRefs = append(eligibleRefs, t.TradeNo)
	}

	type creditGrantAgg struct {
		Reference  string `gorm:"column:reference"`
		TotalQuota int64  `gorm:"column:total_quota"`
		UsedQuota  int64  `gorm:"column:used_quota"`
	}
	grantAgg := map[string]creditGrantAgg{}
	if len(eligibleRefs) > 0 {
		var rows []creditGrantAgg
		if err := model.DB.Model(&model.CreditGrant{}).
			Where("user_id = ? AND grant_type = ? AND reference IN ?", userId, "topup", eligibleRefs).
			Select("reference, SUM(quota) as total_quota, SUM(used_quota) as used_quota").
			Group("reference").
			Scan(&rows).Error; err != nil {
			common.ApiError(c, err)
			return
		}
		for _, r := range rows {
			grantAgg[r.Reference] = r
		}
	}

	type topUpWithRefund struct {
		model.TopUp
		Refundable              bool   `json:"refundable"`
		RefundIneligibleReason  string `json:"refund_ineligible_reason,omitempty"`
		RefundWindowSecondsLeft int64  `json:"refund_window_seconds_left,omitempty"`
	}

	decorateRefund := func(t *model.TopUp) topUpWithRefund {
		row := topUpWithRefund{TopUp: *t}
		switch t.Status {
		case common.TopUpStatusRefunded:
			row.Refundable = false
			row.RefundIneligibleReason = "Already refunded"
			return row
		case common.TopUpStatusRefundPending:
			row.Refundable = false
			row.RefundIneligibleReason = "Refund in progress"
			return row
		}
		if t.Status != common.TopUpStatusSuccess {
			row.Refundable = false
			row.RefundIneligibleReason = "Only successful payments can be refunded"
			return row
		}
		if t.PaymentMethod != PaymentMethodStripe {
			row.Refundable = false
			row.RefundIneligibleReason = "Only Stripe payments can be refunded"
			return row
		}
		paidAt := t.CompleteTime
		if paidAt == 0 {
			paidAt = t.CreateTime
		}
		if paidAt == 0 {
			row.Refundable = false
			row.RefundIneligibleReason = "Missing payment time"
			return row
		}
		age := now - paidAt
		if age > topUpRefundWindowSeconds {
			row.Refundable = false
			row.RefundIneligibleReason = "Refund window expired"
			row.RefundWindowSecondsLeft = 0
			return row
		}
		row.RefundWindowSecondsLeft = topUpRefundWindowSeconds - age
		agg, ok := grantAgg[t.TradeNo]
		if !ok {
			row.Refundable = false
			row.RefundIneligibleReason = "Credits not found"
			return row
		}
		if agg.UsedQuota > 0 {
			row.Refundable = false
			row.RefundIneligibleReason = "Credits already used"
			return row
		}
		if agg.TotalQuota <= 0 {
			row.Refundable = false
			row.RefundIneligibleReason = "Invalid credit grant"
			return row
		}
		row.Refundable = true
		row.RefundIneligibleReason = ""
		return row
	}

	items := make([]topUpWithRefund, 0, len(topups))
	for _, t := range topups {
		if t == nil {
			continue
		}
		items = append(items, decorateRefund(t))
	}

	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

// GetAllTopUps 管理员获取全平台充值记录
func GetAllTopUps(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	keyword := c.Query("keyword")

	var (
		topups []*model.TopUp
		total  int64
		err    error
	)
	if keyword != "" {
		topups, total, err = model.SearchAllTopUps(keyword, pageInfo)
	} else {
		topups, total, err = model.GetAllTopUps(pageInfo)
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}

	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(topups)
	common.ApiSuccess(c, pageInfo)
}

type AdminCompleteTopupRequest struct {
	TradeNo string `json:"trade_no"`
}

// AdminCompleteTopUp 管理员补单接口
func AdminCompleteTopUp(c *gin.Context) {
	var req AdminCompleteTopupRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.TradeNo == "" {
		common.ApiErrorMsg(c, "Invalid parameters")
		return
	}

	if err := model.ManualCompleteTopUp(req.TradeNo); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
