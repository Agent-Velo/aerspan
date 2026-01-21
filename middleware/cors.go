package middleware

import (
	"os"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func CORS() gin.HandlerFunc {
	config := cors.DefaultConfig()

	originsEnv := strings.TrimSpace(os.Getenv("CORS_ALLOW_ORIGINS"))
	if originsEnv == "" {
		// Safe default: allow all origins, but do NOT allow credentialed requests.
		// If you need cookies across origins, set CORS_ALLOW_ORIGINS to an explicit allowlist.
		config.AllowAllOrigins = true
		config.AllowCredentials = false
	} else {
		config.AllowAllOrigins = false
		config.AllowOrigins = splitCommaSeparated(originsEnv)
		if len(config.AllowOrigins) == 0 {
			config.AllowAllOrigins = true
			config.AllowCredentials = false
		} else {
			config.AllowWildcard = true
			config.AllowCredentials = parseBoolEnv("CORS_ALLOW_CREDENTIALS", true)
		}
	}

	config.MaxAge = 12 * time.Hour
	config.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
	config.AllowHeaders = []string{
		"Origin",
		"Content-Length",
		"Content-Type",
		"Authorization",
		"New-Api-User",
		"X-Api-Key",
		"X-Goog-Api-Key",
		"Anthropic-Version",
		"OpenAI-Beta",
		"OpenAI-Organization",
		"OpenAI-Project",
		"Accept",
		"Cache-Control",
		"X-Requested-With",
	}
	return cors.New(config)
}

func splitCommaSeparated(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		result = append(result, trimmed)
	}
	return result
}

func parseBoolEnv(key string, defaultValue bool) bool {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return defaultValue
	}
	switch strings.ToLower(raw) {
	case "1", "true", "t", "yes", "y", "on":
		return true
	case "0", "false", "f", "no", "n", "off":
		return false
	default:
		return defaultValue
	}
}
