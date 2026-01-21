package model

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const creditGrantMigrationVersionKey = "CreditGrantMigrationVersion"

// CreditGrant represents a batch of credits (quota) granted to a user.
// Credits are consumed from the earliest-expiring grants first.
//
// Notes:
// - Quota/UsedQuota are stored in the same unit as user.quota (NOT money).
// - ExpiredTime is a unix timestamp in seconds. 0 means never expires.
// - Negative grants are intentionally NOT supported. Use consumption/refund APIs.
type CreditGrant struct {
	Id          int    `json:"id"`
	UserId      int    `json:"user_id" gorm:"index"`
	GrantType   string `json:"grant_type" gorm:"type:varchar(32);index"`
	Quota       int    `json:"quota" gorm:"type:int;not null"`
	UsedQuota   int    `json:"used_quota" gorm:"type:int;default:0"`
	CreatedTime int64  `json:"created_time" gorm:"bigint;index"`
	ExpiredTime int64  `json:"expired_time" gorm:"bigint;default:0;index"`
	Reference   string `json:"reference" gorm:"type:varchar(128);index"`
	Remark      string `json:"remark" gorm:"type:varchar(255)"`
	CreatedBy   int    `json:"created_by" gorm:"type:int;default:0;index"`
}

func (CreditGrant) TableName() string {
	return "credit_grants"
}

type CreateCreditGrantParams struct {
	UserId      int
	Quota       int
	GrantType   string
	Reference   string
	Remark      string
	CreatedBy   int
	CreatedTime int64
	ExpiredTime int64
}

var ErrInsufficientUserQuota = errors.New("insufficient user quota")

type InsufficientUserQuotaError struct {
	Remaining int
	Required  int
}

func (e *InsufficientUserQuotaError) Error() string {
	return fmt.Sprintf("insufficient user quota: remaining %d, required %d", e.Remaining, e.Required)
}

func (e *InsufficientUserQuotaError) Is(target error) bool {
	return target == ErrInsufficientUserQuota
}

func CreateCreditGrantTx(tx *gorm.DB, params CreateCreditGrantParams) (*CreditGrant, error) {
	if params.UserId <= 0 {
		return nil, errors.New("invalid user id")
	}
	if params.Quota <= 0 {
		return nil, errors.New("quota must be greater than 0")
	}
	now := common.GetTimestamp()
	createdAt := params.CreatedTime
	if createdAt == 0 {
		createdAt = now
	}
	if params.ExpiredTime != 0 && params.ExpiredTime <= now {
		return nil, errors.New("expiration time must be in the future")
	}
	grant := &CreditGrant{
		UserId:      params.UserId,
		GrantType:   params.GrantType,
		Quota:       params.Quota,
		UsedQuota:   0,
		CreatedTime: createdAt,
		ExpiredTime: params.ExpiredTime,
		Reference:   params.Reference,
		Remark:      params.Remark,
		CreatedBy:   params.CreatedBy,
	}
	if err := tx.Create(grant).Error; err != nil {
		return nil, err
	}
	res := tx.Model(&User{}).Where("id = ?", params.UserId).
		Update("quota", gorm.Expr("quota + ?", params.Quota))
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected != 1 {
		return nil, errors.New("user not found")
	}

	nextExpiresAt, err := getUserNextQuotaExpiresAtTx(tx, params.UserId, now)
	if err != nil {
		return nil, err
	}
	res = tx.Model(&User{}).Where("id = ?", params.UserId).
		Update("quota_expires_at", nextExpiresAt)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected != 1 {
		return nil, errors.New("user not found")
	}
	return grant, nil
}

func CreateCreditGrant(params CreateCreditGrantParams) (*CreditGrant, error) {
	var created *CreditGrant
	err := DB.Transaction(func(tx *gorm.DB) error {
		g, err := CreateCreditGrantTx(tx, params)
		if err != nil {
			return err
		}
		created = g
		return nil
	})
	return created, err
}

func getUserNextQuotaExpiresAtTx(tx *gorm.DB, userId int, now int64) (int64, error) {
	_ = now
	var next sql.NullInt64
	err := tx.Model(&CreditGrant{}).
		Where("user_id = ? AND expired_time != 0 AND quota > used_quota", userId).
		Select("MIN(expired_time)").
		Scan(&next).Error
	if err != nil {
		return 0, err
	}
	if !next.Valid {
		return 0, nil
	}
	return next.Int64, nil
}

func expireUserCreditGrantsIfNeededTx(tx *gorm.DB, userId int, now int64) (expiredRemaining int, newExpiresAt int64, err error) {
	// Find remaining credits in already-expired grants.
	var expiredSum sql.NullInt64
	err = tx.Model(&CreditGrant{}).
		Where("user_id = ? AND expired_time != 0 AND expired_time <= ? AND quota > used_quota", userId, now).
		Select("COALESCE(SUM(quota - used_quota), 0)").
		Scan(&expiredSum).Error
	if err != nil {
		return 0, 0, err
	}
	expiredRemaining = int(expiredSum.Int64)

	// Mark expired grants as fully used so they no longer contribute to remaining quota.
	if expiredRemaining > 0 {
		if err := tx.Model(&CreditGrant{}).
			Where("user_id = ? AND expired_time != 0 AND expired_time <= ? AND quota > used_quota", userId, now).
			Update("used_quota", gorm.Expr("quota")).Error; err != nil {
			return 0, 0, err
		}

		// Clamp user quota to >= 0.
		var currentQuota int
		if err := tx.Model(&User{}).Where("id = ?", userId).Select("quota").Find(&currentQuota).Error; err != nil {
			return 0, 0, err
		}
		newQuota := currentQuota - expiredRemaining
		if newQuota < 0 {
			newQuota = 0
		}
		if err := tx.Model(&User{}).Where("id = ?", userId).Update("quota", newQuota).Error; err != nil {
			return 0, 0, err
		}
	}

	newExpiresAt, err = getUserNextQuotaExpiresAtTx(tx, userId, now)
	if err != nil {
		return expiredRemaining, 0, err
	}
	if err := tx.Model(&User{}).Where("id = ?", userId).Update("quota_expires_at", newExpiresAt).Error; err != nil {
		return expiredRemaining, 0, err
	}
	return expiredRemaining, newExpiresAt, nil
}

func consumeUserQuotaTx(tx *gorm.DB, userId int, amount int) error {
	if amount < 0 {
		return errors.New("quota can't be negative")
	}
	if amount == 0 {
		return nil
	}
	now := common.GetTimestamp()

	var user User
	if err := tx.Set("gorm:query_option", "FOR UPDATE").Select("id", "quota", "quota_expires_at").First(&user, userId).Error; err != nil {
		return err
	}

	if user.QuotaExpiresAt != 0 && user.QuotaExpiresAt <= now {
		_, _, err := expireUserCreditGrantsIfNeededTx(tx, userId, now)
		if err != nil {
			return err
		}
		if err := tx.Select("quota").First(&user, userId).Error; err != nil {
			return err
		}
	}

	if user.Quota < amount {
		return &InsufficientUserQuotaError{Remaining: user.Quota, Required: amount}
	}

	var grants []CreditGrant
	// Consume from earliest expiring grants first; non-expiring grants last.
	order := "CASE WHEN expired_time = 0 THEN 1 ELSE 0 END ASC, expired_time ASC, id ASC"
	err := tx.Set("gorm:query_option", "FOR UPDATE").
		Where("user_id = ? AND quota > used_quota AND (expired_time = 0 OR expired_time > ?)", userId, now).
		Order(order).
		Find(&grants).Error
	if err != nil {
		return err
	}

	remaining := amount
	for i := range grants {
		if remaining <= 0 {
			break
		}
		available := grants[i].Quota - grants[i].UsedQuota
		if available <= 0 {
			continue
		}
		delta := available
		if delta > remaining {
			delta = remaining
		}
		if err := tx.Model(&CreditGrant{}).
			Where("id = ?", grants[i].Id).
			Update("used_quota", gorm.Expr("used_quota + ?", delta)).Error; err != nil {
			return err
		}
		remaining -= delta
	}
	if remaining != 0 {
		// This should not happen if user.quota is consistent with grants.
		return &InsufficientUserQuotaError{Remaining: user.Quota - (amount - remaining), Required: remaining}
	}

	if err := tx.Model(&User{}).Where("id = ?", userId).
		Update("quota", gorm.Expr("quota - ?", amount)).Error; err != nil {
		return err
	}
	// Update next expiration timestamp.
	nextExpiresAt, err := getUserNextQuotaExpiresAtTx(tx, userId, now)
	if err != nil {
		return err
	}
	if err := tx.Model(&User{}).Where("id = ?", userId).
		Update("quota_expires_at", nextExpiresAt).Error; err != nil {
		return err
	}
	return nil
}

func refundUserQuotaTx(tx *gorm.DB, userId int, amount int) error {
	if amount < 0 {
		return errors.New("quota can't be negative")
	}
	if amount == 0 {
		return nil
	}
	now := common.GetTimestamp()

	var user User
	if err := tx.Set("gorm:query_option", "FOR UPDATE").Select("id", "quota", "quota_expires_at").First(&user, userId).Error; err != nil {
		return err
	}
	if user.QuotaExpiresAt != 0 && user.QuotaExpiresAt <= now {
		_, _, err := expireUserCreditGrantsIfNeededTx(tx, userId, now)
		if err != nil {
			return err
		}
	}

	var grants []CreditGrant
	// Refund in reverse order of consumption: non-expiring first, then latest expiring.
	order := "CASE WHEN expired_time = 0 THEN 0 ELSE 1 END ASC, expired_time DESC, id DESC"
	err := tx.Set("gorm:query_option", "FOR UPDATE").
		Where("user_id = ? AND used_quota > 0 AND (expired_time = 0 OR expired_time > ?)", userId, now).
		Order(order).
		Find(&grants).Error
	if err != nil {
		return err
	}

	remaining := amount
	for i := range grants {
		if remaining <= 0 {
			break
		}
		refundable := grants[i].UsedQuota
		if refundable <= 0 {
			continue
		}
		delta := refundable
		if delta > remaining {
			delta = remaining
		}
		if err := tx.Model(&CreditGrant{}).
			Where("id = ?", grants[i].Id).
			Update("used_quota", gorm.Expr("used_quota - ?", delta)).Error; err != nil {
			return err
		}
		remaining -= delta
	}
	if remaining != 0 {
		return fmt.Errorf("refund exceeds used quota")
	}

	if err := tx.Model(&User{}).Where("id = ?", userId).
		Update("quota", gorm.Expr("quota + ?", amount)).Error; err != nil {
		return err
	}
	nextExpiresAt, err := getUserNextQuotaExpiresAtTx(tx, userId, now)
	if err != nil {
		return err
	}
	if err := tx.Model(&User{}).Where("id = ?", userId).
		Update("quota_expires_at", nextExpiresAt).Error; err != nil {
		return err
	}
	return nil
}

func ConsumeUserQuota(userId int, amount int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		return consumeUserQuotaTx(tx, userId, amount)
	})
}

func RefundUserQuota(userId int, amount int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		return refundUserQuotaTx(tx, userId, amount)
	})
}

// DefaultTopUpCreditExpiry returns the default expiry timestamp for top-up credits.
// Current policy: 24 months.
func DefaultTopUpCreditExpiry(fromUnixSeconds int64) int64 {
	if fromUnixSeconds == 0 {
		fromUnixSeconds = common.GetTimestamp()
	}
	t := time.Unix(fromUnixSeconds, 0).UTC().AddDate(2, 0, 0)
	return t.Unix()
}

func ListUserCreditGrants(userId int, pageInfo *common.PageInfo) (grants []*CreditGrant, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err = tx.Model(&CreditGrant{}).Where("user_id = ?", userId).Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}
	if err = tx.Where("user_id = ?", userId).
		Order("id desc").
		Limit(pageInfo.GetPageSize()).
		Offset(pageInfo.GetStartIdx()).
		Find(&grants).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}
	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return grants, total, nil
}

func getOptionValueFromDBForCreditGrant(key string) (string, bool, error) {
	var opt Option
	err := DB.First(&opt, "key = ?", key).Error
	if err == nil {
		return opt.Value, true, nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", false, nil
	}
	return "", false, err
}

// MigrateCreditGrantsIfNeeded migrates the legacy user.quota balance into credit_grants.
// It is idempotent and safe to run on every startup.
func MigrateCreditGrantsIfNeeded() {
	version, exists, err := getOptionValueFromDBForCreditGrant(creditGrantMigrationVersionKey)
	if err != nil {
		common.SysLog(fmt.Sprintf("credit grant migration: failed to read version: %v", err))
		return
	}
	if exists && version == "1" {
		return
	}

	common.SysLog("credit grant migration: started")
	now := common.GetTimestamp()
	pageSize := 200
	page := 0
	for {
		var users []User
		err := DB.Select("id", "quota").Order("id asc").Limit(pageSize).Offset(page * pageSize).Find(&users).Error
		if err != nil {
			common.SysLog(fmt.Sprintf("credit grant migration: list users failed: %v", err))
			return
		}
		if len(users) == 0 {
			break
		}
		for _, u := range users {
			if u.Id == 0 || u.Quota <= 0 {
				continue
			}
			// Ensure sum(remaining grants) >= user.quota by creating a migration grant for the diff.
			var existing sql.NullInt64
			if err := DB.Model(&CreditGrant{}).
				Where("user_id = ?", u.Id).
				Select("COALESCE(SUM(quota - used_quota), 0)").
				Scan(&existing).Error; err != nil {
				common.SysLog(fmt.Sprintf("credit grant migration: sum grants failed for user %d: %v", u.Id, err))
				continue
			}
			current := int(existing.Int64)
			diff := u.Quota - current
			if diff <= 0 {
				// Refresh quota_expires_at for safety.
				nextExpiresAt, err := getUserNextQuotaExpiresAtTx(DB, u.Id, now)
				if err == nil {
					_ = DB.Model(&User{}).Where("id = ?", u.Id).Update("quota_expires_at", nextExpiresAt).Error
				}
				continue
			}
			_ = DB.Transaction(func(tx *gorm.DB) error {
				grant := &CreditGrant{
					UserId:      u.Id,
					GrantType:   "migration",
					Quota:       diff,
					UsedQuota:   0,
					CreatedTime: now,
					ExpiredTime: 0,
					Reference:   "legacy_user_quota",
					Remark:      "auto-migrated from legacy user quota",
					CreatedBy:   0,
				}
				if err := tx.Create(grant).Error; err != nil {
					return err
				}
				nextExpiresAt, err := getUserNextQuotaExpiresAtTx(tx, u.Id, now)
				if err != nil {
					return err
				}
				return tx.Model(&User{}).Where("id = ?", u.Id).Update("quota_expires_at", nextExpiresAt).Error
			})
		}
		page++
	}

	if err := UpdateOption(creditGrantMigrationVersionKey, "1"); err != nil {
		common.SysLog(fmt.Sprintf("credit grant migration: write version failed: %v", err))
		return
	}
	common.SysLog("credit grant migration: completed")
}
