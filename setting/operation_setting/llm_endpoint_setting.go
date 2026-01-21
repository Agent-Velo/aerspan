package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// LLMEndpointSetting controls which LLM-related API endpoints are enabled globally.
//
// Disabled endpoints should behave like the endpoint does not exist (HTTP 404).
//
// Default: enable completions and chat completions, disable everything else.
type LLMEndpointSetting struct {
	EnableCompletions     bool `json:"enable_completions"`
	EnableChatCompletions bool `json:"enable_chat_completions"`
	EnableResponses       bool `json:"enable_responses"`
	EnableClaudeMessages  bool `json:"enable_claude_messages"`
	EnableEmbeddings      bool `json:"enable_embeddings"`
	EnableImages          bool `json:"enable_images"`
	EnableAudio           bool `json:"enable_audio"`
	EnableModerations     bool `json:"enable_moderations"`
	EnableRerank          bool `json:"enable_rerank"`
	EnableRealtime        bool `json:"enable_realtime"`
	EnableGemini          bool `json:"enable_gemini"`
}

var llmEndpointSetting = LLMEndpointSetting{
	EnableCompletions:     true,
	EnableChatCompletions: true,
	EnableResponses:       false,
	EnableClaudeMessages:  false,
	EnableEmbeddings:      false,
	EnableImages:          false,
	EnableAudio:           false,
	EnableModerations:     false,
	EnableRerank:          false,
	EnableRealtime:        false,
	EnableGemini:          false,
}

func init() {
	config.GlobalConfig.Register("llm_endpoint_setting", &llmEndpointSetting)
}

func GetLLMEndpointSetting() *LLMEndpointSetting {
	return &llmEndpointSetting
}

