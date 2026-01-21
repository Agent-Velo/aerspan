package common

import (
	crand "crypto/rand"
	"encoding/hex"
)

// GenerateRandomHexString returns a lowercase hex string with the given length.
//
// length=6 corresponds to 3 random bytes (16^6 possibilities).
func GenerateRandomHexString(length int) (string, error) {
	if length <= 0 {
		return "", nil
	}

	// Each byte encodes to 2 hex characters.
	bytesLen := (length + 1) / 2
	buf := make([]byte, bytesLen)
	if _, err := crand.Read(buf); err != nil {
		return "", err
	}

	hexStr := hex.EncodeToString(buf)
	if len(hexStr) > length {
		hexStr = hexStr[:length]
	}
	return hexStr, nil
}
