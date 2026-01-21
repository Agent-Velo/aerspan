package middleware

import (
	"fmt"
	"net/http"

	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

// LLMEndpointGuard blocks globally disabled LLM-related endpoints.
//
// It returns 404 to make disabled endpoints behave like they do not exist.
func LLMEndpointGuard() gin.HandlerFunc {
	return func(c *gin.Context) {
		enabled, ok := isCurrentLLMEndpointEnabled(c)
		if ok && !enabled {
			abortAsRelayNotFound(c)
			return
		}
		c.Next()
	}
}

func isCurrentLLMEndpointEnabled(c *gin.Context) (enabled bool, ok bool) {
	fullPath := c.FullPath()
	if fullPath == "" {
		return true, false
	}

	settings := operation_setting.GetLLMEndpointSetting()

	switch fullPath {
	case "/v1/completions":
		return settings.EnableCompletions, true
	case "/v1/chat/completions", "/pg/chat/completions":
		return settings.EnableChatCompletions, true
	case "/v1/responses":
		return settings.EnableResponses, true
	case "/v1/messages":
		return settings.EnableClaudeMessages, true
	case "/v1/embeddings":
		return settings.EnableEmbeddings, true
	case "/v1/edits", "/v1/images/generations", "/v1/images/edits", "/v1/images/variations":
		return settings.EnableImages, true
	case "/v1/audio/transcriptions", "/v1/audio/translations", "/v1/audio/speech":
		return settings.EnableAudio, true
	case "/v1/moderations":
		return settings.EnableModerations, true
	case "/v1/rerank":
		return settings.EnableRerank, true
	case "/v1/realtime":
		return settings.EnableRealtime, true
	case "/v1/engines/:model/embeddings", "/v1/models/*path", "/v1beta/models", "/v1beta/openai/models", "/v1beta/models/*path":
		return settings.EnableGemini, true
	default:
		return true, false
	}
}

func abortAsRelayNotFound(c *gin.Context) {
	err := types.OpenAIError{
		Message: fmt.Sprintf("Invalid URL (%s %s)", c.Request.Method, c.Request.URL.Path),
		Type:    "invalid_request_error",
		Param:   "",
		Code:    "",
	}
	c.JSON(http.StatusNotFound, gin.H{
		"error": err,
	})
	c.Abort()
}

