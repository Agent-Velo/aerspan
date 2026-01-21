package common

import (
	"regexp"
	"testing"
)

func TestGenerateTokenKey_Format(t *testing.T) {
	key, err := GenerateTokenKey()
	if err != nil {
		t.Fatalf("GenerateTokenKey() error: %v", err)
	}
	if len(key) != TokenKeyHexLength {
		t.Fatalf("unexpected key length: got %d, want %d", len(key), TokenKeyHexLength)
	}
	if !regexp.MustCompile(`^[0-9a-f]{32}$`).MatchString(key) {
		t.Fatalf("key is not lower hex: %q", key)
	}
}

func TestParseTokenAPIKey_NewFormat(t *testing.T) {
	apiKey := TokenAPIKeyPrefix + "0123456789abcdef0123456789abcdef"
	key, parts := ParseTokenAPIKey(apiKey)
	if key != "0123456789abcdef0123456789abcdef" {
		t.Fatalf("unexpected key: %q", key)
	}
	if len(parts) != 1 || parts[0] != key {
		t.Fatalf("unexpected parts: %#v", parts)
	}
}

func TestParseTokenAPIKey_NewFormat_WithExtra(t *testing.T) {
	apiKey := TokenAPIKeyPrefix + "0123456789abcdef0123456789abcdef-123"
	key, parts := ParseTokenAPIKey(apiKey)
	if key != "0123456789abcdef0123456789abcdef" {
		t.Fatalf("unexpected key: %q", key)
	}
	if len(parts) != 2 || parts[0] != key || parts[1] != "123" {
		t.Fatalf("unexpected parts: %#v", parts)
	}
}

func TestParseTokenAPIKey_LegacyFormat(t *testing.T) {
	apiKey := LegacyTokenAPIKeyPrefix + "legacyKeyABC123"
	key, parts := ParseTokenAPIKey(apiKey)
	if key != "legacyKeyABC123" {
		t.Fatalf("unexpected key: %q", key)
	}
	if len(parts) != 1 || parts[0] != key {
		t.Fatalf("unexpected parts: %#v", parts)
	}
}

func TestParseTokenAPIKey_LegacyFormat_WithExtra(t *testing.T) {
	apiKey := LegacyTokenAPIKeyPrefix + "legacyKeyABC123-456"
	key, parts := ParseTokenAPIKey(apiKey)
	if key != "legacyKeyABC123" {
		t.Fatalf("unexpected key: %q", key)
	}
	if len(parts) != 2 || parts[0] != key || parts[1] != "456" {
		t.Fatalf("unexpected parts: %#v", parts)
	}
}
