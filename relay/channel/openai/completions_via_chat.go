package openai

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/setting/model_setting"
)

func shouldUseChatCompletionsForCompletions(info *relaycommon.RelayInfo) bool {
	if info == nil {
		return false
	}
	if info.ChannelType != constant.ChannelTypeOpenAI {
		return false
	}
	if info.RelayMode != relayconstant.RelayModeCompletions {
		return false
	}
	if !info.ChannelSetting.CompletionsViaChatCompletions {
		return false
	}
	// This feature needs request-body conversion, so it cannot be used when passthrough is enabled.
	if model_setting.GetGlobalSettings().PassThroughRequestEnabled || info.ChannelSetting.PassThroughBodyEnabled {
		return false
	}
	return true
}

func completionsCompatibleID(upstreamID string) string {
	if upstreamID == "" {
		return ""
	}
	if strings.HasPrefix(upstreamID, "chatcmpl-") {
		return "cmpl-" + strings.TrimPrefix(upstreamID, "chatcmpl-")
	}
	return upstreamID
}

func completionsPromptToString(prompt any) string {
	if prompt == nil {
		return ""
	}

	switch v := prompt.(type) {
	case string:
		return v
	case []any:
		parts := make([]string, 0, len(v))
		for _, item := range v {
			if item == nil {
				continue
			}
			if s, ok := item.(string); ok {
				parts = append(parts, s)
				continue
			}
			parts = append(parts, common.Interface2String(item))
		}
		return strings.Join(parts, "\n")
	default:
		return fmt.Sprintf("%v", prompt)
	}
}
