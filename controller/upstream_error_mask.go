package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/types"
)

const overloadedMessage = "Overloaded"

func shouldMaskUpstreamStatusCode(statusCode int) bool {
	if statusCode >= 500 && statusCode <= 599 {
		return true
	}
	if statusCode >= 400 && statusCode <= 499 {
		return statusCode != http.StatusBadRequest && statusCode != http.StatusRequestEntityTooLarge
	}
	return false
}

func shouldReturnOverloadedForUpstreamError(err *types.NewAPIError) bool {
	if err == nil {
		return false
	}
	if !err.IsUpstreamError() {
		return false
	}
	return shouldMaskUpstreamStatusCode(err.UpstreamStatusCode())
}

func overloadedOpenAIError() types.OpenAIError {
	return types.OpenAIError{
		Message: overloadedMessage,
		Type:    "upstream_error",
		Param:   "",
		Code:    nil,
	}
}

func overloadedClaudeError() types.ClaudeError {
	return types.ClaudeError{
		Type:    "upstream_error",
		Message: overloadedMessage,
	}
}
