package common

import (
	"regexp"
	"testing"
)

func TestGenerateRandomHexKey_LengthAndFormat(t *testing.T) {
	key, err := GenerateRandomHexKey(16)
	if err != nil {
		t.Fatalf("GenerateRandomHexKey() error: %v", err)
	}
	if len(key) != 16 {
		t.Fatalf("unexpected key length: got %d, want %d", len(key), 16)
	}
	if !regexp.MustCompile(`^[0-9a-f]{16}$`).MatchString(key) {
		t.Fatalf("key is not lower hex: %q", key)
	}
}

func TestGenerateRandomHexKey_InvalidLength(t *testing.T) {
	if _, err := GenerateRandomHexKey(0); err == nil {
		t.Fatalf("expected error for zero length")
	}
	if _, err := GenerateRandomHexKey(15); err == nil {
		t.Fatalf("expected error for odd length")
	}
}
