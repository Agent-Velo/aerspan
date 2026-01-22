package system_setting

import "strings"

func normalizeBaseURL(raw string) string {
	return strings.TrimRight(strings.TrimSpace(raw), "/")
}

// GetFrontendBaseURL returns the base URL used for user-facing links.
//
// Fallback order:
// - FrontendBaseUrl
// - ServerAddress (legacy)
// - BackendBaseUrl
func GetFrontendBaseURL() string {
	if base := normalizeBaseURL(FrontendBaseUrl); base != "" {
		return base
	}
	if base := normalizeBaseURL(ServerAddress); base != "" {
		return base
	}
	return normalizeBaseURL(BackendBaseUrl)
}

// GetBackendBaseURL returns the base URL used for API/callback endpoints.
//
// Fallback order:
// - BackendBaseUrl
// - ServerAddress (legacy)
// - FrontendBaseUrl
func GetBackendBaseURL() string {
	if base := normalizeBaseURL(BackendBaseUrl); base != "" {
		return base
	}
	if base := normalizeBaseURL(ServerAddress); base != "" {
		return base
	}
	return normalizeBaseURL(FrontendBaseUrl)
}
