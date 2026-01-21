package model

import (
	"errors"
	"strings"
	"time"

	"gorm.io/gorm/clause"
)

// AffCodeAlias stores legacy/refreshed invite codes so old links keep working
// after an aff code format change.
type AffCodeAlias struct {
	Code      string    `gorm:"primaryKey;type:varchar(32);column:code"`
	UserId    int       `gorm:"type:int;column:user_id;index"`
	CreatedAt time.Time `gorm:"autoCreateTime"`
}

func AddAffCodeAlias(code string, userId int) error {
	code = strings.TrimSpace(code)
	if code == "" {
		return errors.New("missing affiliate code")
	}
	if userId == 0 {
		return errors.New("missing user id")
	}

	alias := &AffCodeAlias{Code: code, UserId: userId}
	return DB.Clauses(clause.OnConflict{DoNothing: true}).Create(alias).Error
}
