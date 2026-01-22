package model

import (
	"errors"

	"gorm.io/gorm"
)

const (
	RewardClaimStatusPending = 0
	RewardClaimStatusClaimed = 1
)

// RewardClaim stores pending registration / referral rewards that require card verification.
//
// Notes:
// - Quotas are stored in the same unit as user.quota (NOT money).
// - StripePaymentIntentID refers to a $1 manual-capture PaymentIntent used for pre-authorization.
// - StripeVoidAfter is a unix timestamp in seconds; the pre-authorization is canceled after this time.
type RewardClaim struct {
	Id                   int    `json:"id"`
	UserId               int    `json:"user_id" gorm:"uniqueIndex"`
	InviterId            int    `json:"inviter_id" gorm:"index"`
	SignupQuota          int    `json:"signup_quota" gorm:"type:int;default:0"`
	InviteeQuota         int    `json:"invitee_quota" gorm:"type:int;default:0"`
	InviterAffQuota      int    `json:"inviter_aff_quota" gorm:"type:int;default:0"`
	Status               int    `json:"status" gorm:"type:int;default:0;index"`
	StripePreauthAttempt int    `json:"stripe_preauth_attempt" gorm:"type:int;default:0"`
	StripePaymentIntent  string `json:"stripe_payment_intent_id" gorm:"type:varchar(64);index"`
	StripePaymentStatus  string `json:"stripe_payment_intent_status" gorm:"type:varchar(32)"`
	StripeVoidAfter      int64  `json:"stripe_void_after" gorm:"type:bigint;default:0;index"`
	StripeVoidedTime     int64  `json:"stripe_voided_time" gorm:"type:bigint;default:0;index"`
	CreatedTime          int64  `json:"created_time" gorm:"type:bigint;index"`
	ClaimedTime          int64  `json:"claimed_time" gorm:"type:bigint;default:0;index"`
}

func (RewardClaim) TableName() string {
	return "reward_claims"
}

func CreateRewardClaimTx(tx *gorm.DB, claim *RewardClaim) error {
	if tx == nil {
		return errors.New("tx is nil")
	}
	if claim == nil {
		return errors.New("claim is nil")
	}
	if claim.UserId <= 0 {
		return errors.New("invalid user id")
	}
	return tx.Create(claim).Error
}

func GetRewardClaimByUserId(userId int) (*RewardClaim, error) {
	if userId <= 0 {
		return nil, errors.New("invalid user id")
	}
	var claim RewardClaim
	if err := DB.Where("user_id = ?", userId).First(&claim).Error; err != nil {
		return nil, err
	}
	return &claim, nil
}

func GetRewardClaimByUserIdForUpdateTx(tx *gorm.DB, userId int) (*RewardClaim, error) {
	if tx == nil {
		return nil, errors.New("tx is nil")
	}
	if userId <= 0 {
		return nil, errors.New("invalid user id")
	}
	var claim RewardClaim
	if err := tx.Set("gorm:query_option", "FOR UPDATE").Where("user_id = ?", userId).First(&claim).Error; err != nil {
		return nil, err
	}
	return &claim, nil
}

func ListRewardClaimsDueForStripeVoid(now int64, limit int) ([]*RewardClaim, error) {
	if limit <= 0 {
		limit = 100
	}
	claims := make([]*RewardClaim, 0)
	err := DB.
		Where("stripe_void_after != 0 AND stripe_void_after <= ?", now).
		Where("stripe_voided_time = 0").
		Where("stripe_payment_intent_id != ''").
		Order("id asc").
		Limit(limit).
		Find(&claims).Error
	if err != nil {
		return nil, err
	}
	return claims, nil
}

func MarkRewardClaimStripeVoided(id int, voidedAt int64, status string) error {
	if id <= 0 {
		return errors.New("invalid claim id")
	}
	return DB.Model(&RewardClaim{}).
		Where("id = ?", id).
		Updates(map[string]any{
			"stripe_voided_time":        voidedAt,
			"stripe_payment_intent_status": status,
		}).Error
}
