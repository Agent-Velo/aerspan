package model

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type TopUp struct {
	Id            int     `json:"id"`
	UserId        int     `json:"user_id" gorm:"index"`
	Amount        int64   `json:"amount"`
	Money         float64 `json:"money"`
	TradeNo       string  `json:"trade_no" gorm:"unique;type:varchar(255);index"`
	PaymentMethod string  `json:"payment_method" gorm:"type:varchar(50)"`
	CreateTime    int64   `json:"create_time"`
	CompleteTime  int64   `json:"complete_time"`
	Status        string  `json:"status"`
}

type inviteCashbackGrant struct {
	InviterID      int
	InviteeID      int
	TradeNo        string
	PaymentIndex   int64
	MaxPayments    int
	RatePercentage float64
	CashbackQuota  int
}

func applyInviteCashbackForTopUpTx(tx *gorm.DB, topUp *TopUp, quotaToAdd int) (*inviteCashbackGrant, error) {
	if tx == nil {
		return nil, errors.New("tx is nil")
	}
	if topUp == nil {
		return nil, errors.New("topUp is nil")
	}
	if topUp.UserId <= 0 {
		return nil, errors.New("invalid topUp user_id")
	}
	if quotaToAdd <= 0 {
		return nil, nil
	}

	maxPayments := common.InviteCashbackMaxPayments
	rate := common.InviteCashbackRate
	if maxPayments <= 0 || rate <= 0 {
		return nil, nil
	}
	if rate > 100 {
		rate = 100
	}

	var invitee User
	if err := tx.Select("id", "inviter_id").First(&invitee, topUp.UserId).Error; err != nil {
		return nil, err
	}
	inviterID := invitee.InviterId
	if inviterID <= 0 || inviterID == topUp.UserId {
		return nil, nil
	}

	var paymentIndex int64
	countStatuses := []string{common.TopUpStatusSuccess, common.TopUpStatusRefundPending, common.TopUpStatusRefunded}
	if err := tx.Model(&TopUp{}).
		Where("user_id = ?", topUp.UserId).
		Where("status IN ?", countStatuses).
		Count(&paymentIndex).Error; err != nil {
		return nil, err
	}
	if paymentIndex <= 0 || int(paymentIndex) > maxPayments {
		return nil, nil
	}

	cashbackQuota := int(decimal.NewFromInt(int64(quotaToAdd)).
		Mul(decimal.NewFromFloat(rate)).
		Div(decimal.NewFromInt(100)).
		IntPart())
	if cashbackQuota <= 0 {
		return nil, nil
	}

	res := tx.Model(&User{}).Where("id = ?", inviterID).Updates(map[string]any{
		"aff_quota":   gorm.Expr("aff_quota + ?", cashbackQuota),
		"aff_history": gorm.Expr("aff_history + ?", cashbackQuota),
	})
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected != 1 {
		return nil, nil
	}

	return &inviteCashbackGrant{
		InviterID:      inviterID,
		InviteeID:      topUp.UserId,
		TradeNo:        topUp.TradeNo,
		PaymentIndex:   paymentIndex,
		MaxPayments:    maxPayments,
		RatePercentage: rate,
		CashbackQuota:  cashbackQuota,
	}, nil
}

func (topUp *TopUp) Insert() error {
	var err error
	err = DB.Create(topUp).Error
	return err
}

func (topUp *TopUp) Update() error {
	var err error
	err = DB.Save(topUp).Error
	return err
}

func GetTopUpById(id int) *TopUp {
	var topUp *TopUp
	var err error
	err = DB.Where("id = ?", id).First(&topUp).Error
	if err != nil {
		return nil
	}
	return topUp
}

func GetTopUpByTradeNo(tradeNo string) *TopUp {
	var topUp *TopUp
	var err error
	err = DB.Where("trade_no = ?", tradeNo).First(&topUp).Error
	if err != nil {
		return nil
	}
	return topUp
}

func Recharge(referenceId string, customerId string) (err error) {
	if referenceId == "" {
		return errors.New("Missing payment reference ID")
	}

	var quotaToAdd int
	var cashbackGrant *inviteCashbackGrant
	topUp := &TopUp{}

	refCol := "`trade_no`"
	if common.UsingPostgreSQL {
		refCol = `"trade_no"`
	}

	err = DB.Transaction(func(tx *gorm.DB) error {
		err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", referenceId).First(topUp).Error
		if err != nil {
			return errors.New("Top-up order not found")
		}

		// Idempotency: Stripe webhooks may be delivered more than once.
		if topUp.Status == common.TopUpStatusSuccess || topUp.Status == common.TopUpStatusRefundPending || topUp.Status == common.TopUpStatusRefunded {
			return nil
		}
		if topUp.Status != common.TopUpStatusPending {
			return errors.New("Invalid top-up order status")
		}

		topUp.CompleteTime = common.GetTimestamp()
		topUp.Status = common.TopUpStatusSuccess
		err = tx.Save(topUp).Error
		if err != nil {
			return err
		}

		// Calculate granted quota precisely.
		quotaToAdd = int(decimal.NewFromFloat(topUp.Money).Mul(decimal.NewFromFloat(common.QuotaPerUnit)).IntPart())
		if quotaToAdd <= 0 {
			return errors.New("Invalid top-up amount")
		}
		if err := tx.Model(&User{}).Where("id = ?", topUp.UserId).Update("stripe_customer", customerId).Error; err != nil {
			return err
		}
		if _, err := CreateCreditGrantTx(tx, CreateCreditGrantParams{
			UserId:      topUp.UserId,
			Quota:       quotaToAdd,
			GrantType:   "topup",
			Reference:   topUp.TradeNo,
			Remark:      "online top-up",
			CreatedTime: topUp.CompleteTime,
			ExpiredTime: DefaultTopUpCreditExpiry(topUp.CompleteTime),
		}); err != nil {
			return err
		}

		grant, err := applyInviteCashbackForTopUpTx(tx, topUp, quotaToAdd)
		if err != nil {
			common.SysLog(fmt.Sprintf("invite cashback skipped: %v", err))
			return nil
		}
		cashbackGrant = grant

		return nil
	})

	if err != nil {
		return errors.New("Top-up failed: " + err.Error())
	}

	RecordLog(topUp.UserId, LogTypeTopup, fmt.Sprintf("Online top-up completed: %v added, paid %d", logger.FormatQuota(quotaToAdd), topUp.Amount))
	if cashbackGrant != nil {
		RecordLog(cashbackGrant.InviterID, LogTypeSystem, fmt.Sprintf(
			"Invite cashback: %s from user %d top-up %s (%d/%d, rate %.4f%%)",
			logger.LogQuota(cashbackGrant.CashbackQuota),
			cashbackGrant.InviteeID,
			cashbackGrant.TradeNo,
			cashbackGrant.PaymentIndex,
			cashbackGrant.MaxPayments,
			cashbackGrant.RatePercentage,
		))
	}

	return nil
}

func GetUserTopUps(userId int, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	// Start transaction
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Get total count within transaction
	err = tx.Model(&TopUp{}).Where("user_id = ?", userId).Count(&total).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	// Get paginated topups within same transaction
	err = tx.Where("user_id = ?", userId).Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	// Commit transaction
	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return topups, total, nil
}

// GetAllTopUps 获取全平台的充值记录（管理员使用）
func GetAllTopUps(pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err = tx.Model(&TopUp{}).Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return topups, total, nil
}

// SearchUserTopUps 按订单号搜索某用户的充值记录
func SearchUserTopUps(userId int, keyword string, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := tx.Model(&TopUp{}).Where("user_id = ?", userId)
	if keyword != "" {
		like := "%%" + keyword + "%%"
		query = query.Where("trade_no LIKE ?", like)
	}

	if err = query.Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = query.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return topups, total, nil
}

// SearchAllTopUps 按订单号搜索全平台充值记录（管理员使用）
func SearchAllTopUps(keyword string, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := tx.Model(&TopUp{})
	if keyword != "" {
		like := "%%" + keyword + "%%"
		query = query.Where("trade_no LIKE ?", like)
	}

	if err = query.Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = query.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return topups, total, nil
}

func HasRecentPendingTopUp(userId int, paymentMethod string, sinceUnix int64) (bool, error) {
	var count int64
	err := DB.Model(&TopUp{}).
		Where("user_id = ?", userId).
		Where("payment_method = ?", paymentMethod).
		Where("status = ?", common.TopUpStatusPending).
		Where("create_time >= ?", sinceUnix).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// ManualCompleteTopUp 管理员手动完成订单并给用户充值
func ManualCompleteTopUp(tradeNo string) error {
	if tradeNo == "" {
		return errors.New("Missing order number")
	}

	refCol := "`trade_no`"
	if common.UsingPostgreSQL {
		refCol = `"trade_no"`
	}

	var userId int
	var quotaToAdd int
	var payMoney float64
	var cashbackGrant *inviteCashbackGrant

	err := DB.Transaction(func(tx *gorm.DB) error {
		topUp := &TopUp{}
		// 行级锁，避免并发补单
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", tradeNo).First(topUp).Error; err != nil {
			return errors.New("Top-up order not found")
		}

		// 幂等处理：已成功直接返回
		if topUp.Status == common.TopUpStatusSuccess {
			return nil
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("Order isn't pending and can't be completed manually")
		}

		// 计算应充值额度：
		// - Stripe 订单：Money 代表经分组倍率换算后的美元数量，直接 * QuotaPerUnit
		// - 其他订单（如易支付）：Amount 为美元数量，* QuotaPerUnit
		if topUp.PaymentMethod == "stripe" {
			dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
			quotaToAdd = int(decimal.NewFromFloat(topUp.Money).Mul(dQuotaPerUnit).IntPart())
		} else {
			dAmount := decimal.NewFromInt(topUp.Amount)
			dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
			quotaToAdd = int(dAmount.Mul(dQuotaPerUnit).IntPart())
		}
		if quotaToAdd <= 0 {
			return errors.New("Invalid top-up amount")
		}

		// 标记完成
		topUp.CompleteTime = common.GetTimestamp()
		topUp.Status = common.TopUpStatusSuccess
		if err := tx.Save(topUp).Error; err != nil {
			return err
		}

		if _, err := CreateCreditGrantTx(tx, CreateCreditGrantParams{
			UserId:      topUp.UserId,
			Quota:       quotaToAdd,
			GrantType:   "topup",
			Reference:   topUp.TradeNo,
			Remark:      "admin completed top-up",
			CreatedTime: topUp.CompleteTime,
			ExpiredTime: DefaultTopUpCreditExpiry(topUp.CompleteTime),
		}); err != nil {
			return err
		}

		grant, err := applyInviteCashbackForTopUpTx(tx, topUp, quotaToAdd)
		if err != nil {
			common.SysLog(fmt.Sprintf("invite cashback skipped: %v", err))
			return nil
		}
		cashbackGrant = grant

		userId = topUp.UserId
		payMoney = topUp.Money
		return nil
	})

	if err != nil {
		return err
	}

	// 事务外记录日志，避免阻塞
	RecordLog(userId, LogTypeTopup, fmt.Sprintf("Admin completed top-up: %v added, paid %f", logger.FormatQuota(quotaToAdd), payMoney))
	if cashbackGrant != nil {
		RecordLog(cashbackGrant.InviterID, LogTypeSystem, fmt.Sprintf(
			"Invite cashback: %s from user %d top-up %s (%d/%d, rate %.4f%%)",
			logger.LogQuota(cashbackGrant.CashbackQuota),
			cashbackGrant.InviteeID,
			cashbackGrant.TradeNo,
			cashbackGrant.PaymentIndex,
			cashbackGrant.MaxPayments,
			cashbackGrant.RatePercentage,
		))
	}
	return nil
}
