package service

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

func StripeChargedAmount(count float64, user model.User) float64 {
	topupGroupRatio := common.GetTopupGroupRatio(user.Group)
	if topupGroupRatio == 0 {
		topupGroupRatio = 1
	}
	return count * topupGroupRatio
}

func StripePayMoney(amount float64, group string) float64 {
	originalAmount := amount
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		amount = amount / common.QuotaPerUnit
	}

	// Using float64 for monetary calculations is acceptable here due to the small amounts involved.
	topupGroupRatio := common.GetTopupGroupRatio(group)
	if topupGroupRatio == 0 {
		topupGroupRatio = 1
	}

	// Apply optional preset discount by the original request amount (if configured), default 1.0.
	discount := 1.0
	if ds, ok := operation_setting.GetPaymentSetting().AmountDiscount[int(originalAmount)]; ok {
		if ds > 0 {
			discount = ds
		}
	}

	return amount * setting.StripeUnitPrice * topupGroupRatio * discount
}

func StripeMinTopup() int64 {
	minTopup := setting.StripeMinTopUp
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		minTopup = minTopup * int(common.QuotaPerUnit)
	}
	return int64(minTopup)
}
