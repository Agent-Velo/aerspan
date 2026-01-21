package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
)

const (
	AffCodeV2Length   = 6
	affCodeV2Attempts = 20
)

// IsAffCodeV2 checks whether code is a 6-char lowercase hex string.
func IsAffCodeV2(code string) bool {
	if len(code) != AffCodeV2Length {
		return false
	}
	for i := 0; i < len(code); i++ {
		c := code[i]
		switch {
		case c >= '0' && c <= '9':
			continue
		case c >= 'a' && c <= 'f':
			continue
		default:
			return false
		}
	}
	return true
}

func isAffCodeTaken(code string) (bool, error) {
	var count int64
	if err := DB.Unscoped().Model(&User{}).Where("aff_code = ?", code).Count(&count).Error; err != nil {
		return false, err
	}
	if count > 0 {
		return true, nil
	}

	count = 0
	if err := DB.Model(&AffCodeAlias{}).Where("code = ?", code).Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

// GenerateUniqueAffCodeV2 returns a unique 6-digit hex aff code.
// It checks both current user aff_code and historical aliases.
func GenerateUniqueAffCodeV2() (string, error) {
	for i := 0; i < affCodeV2Attempts; i++ {
		code, err := common.GenerateRandomHexString(AffCodeV2Length)
		if err != nil {
			return "", err
		}
		taken, err := isAffCodeTaken(code)
		if err != nil {
			return "", err
		}
		if !taken {
			return code, nil
		}
	}
	return "", errors.New("failed to generate unique affiliate code")
}
