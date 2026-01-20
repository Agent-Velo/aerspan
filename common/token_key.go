package common

import (
	crand "crypto/rand"
	"encoding/hex"
	"strings"
)

const (
	// TokenAPIKeyPrefix is the user-facing API key prefix.
	//
	// Full format: sk-ae-v1-[32 hex]
	TokenAPIKeyPrefix = "sk-ae-v1-"

	// LegacyTokenAPIKeyPrefix is kept for backward compatibility.
	LegacyTokenAPIKeyPrefix = "sk-"

	// TokenKeyHexLength is the length of the random part (hex encoded).
	TokenKeyHexLength = 32
)

// GenerateTokenKey generates the raw token key stored in the database.
//
// The user-facing API key is: TokenAPIKeyPrefix + key.
func GenerateTokenKey() (string, error) {
	bytes := make([]byte, TokenKeyHexLength/2)
	if _, err := crand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// ParseTokenAPIKey normalizes a user-provided API key into the raw token key.
//
// Supported formats:
// - sk-ae-v1-[32 hex](-<extra>)
// - sk-<legacy>(-<extra>)
// - <raw>(-<extra>)
//
// It returns (tokenKey, parts) where parts[0] == tokenKey.
func ParseTokenAPIKey(apiKey string) (string, []string) {
	raw := strings.TrimSpace(apiKey)
	if raw == "" {
		return "", nil
	}

	// IMPORTANT: check the new prefix first because it also matches "sk-".
	if strings.HasPrefix(raw, TokenAPIKeyPrefix) {
		raw = strings.TrimPrefix(raw, TokenAPIKeyPrefix)
	} else if strings.HasPrefix(raw, LegacyTokenAPIKeyPrefix) {
		raw = strings.TrimPrefix(raw, LegacyTokenAPIKeyPrefix)
	}

	if raw == "" {
		return "", nil
	}

	// New format: fixed-length hex token key, with optional suffix.
	if len(raw) >= TokenKeyHexLength &&
		isHexASCII(raw[:TokenKeyHexLength]) &&
		(len(raw) == TokenKeyHexLength || raw[TokenKeyHexLength] == '-') {
		tokenKey := raw[:TokenKeyHexLength]
		parts := []string{tokenKey}
		if len(raw) > TokenKeyHexLength+1 {
			extra := raw[TokenKeyHexLength+1:]
			if extra != "" {
				parts = append(parts, strings.Split(extra, "-")...)
			}
		}
		return tokenKey, parts
	}

	// Legacy: token key does not contain '-', so split works.
	parts := strings.Split(raw, "-")
	return parts[0], parts
}

func isHexASCII(s string) bool {
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= '0' && c <= '9':
			continue
		case c >= 'a' && c <= 'f':
			continue
		case c >= 'A' && c <= 'F':
			continue
		default:
			return false
		}
	}
	return true
}
