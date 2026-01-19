package service

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

func appendRequestPath(ctx *gin.Context, relayInfo *relaycommon.RelayInfo, other map[string]interface{}) {
	if other == nil {
		return
	}
	if ctx != nil && ctx.Request != nil && ctx.Request.URL != nil {
		if path := ctx.Request.URL.Path; path != "" {
			other["request_path"] = path
			return
		}
	}
	if relayInfo != nil && relayInfo.RequestURLPath != "" {
		path := relayInfo.RequestURLPath
		if idx := strings.Index(path, "?"); idx != -1 {
			path = path[:idx]
		}
		other["request_path"] = path
	}
}

func GenerateTextOtherInfo(ctx *gin.Context, relayInfo *relaycommon.RelayInfo,
	inputPricePerMillion, outputPricePerMillion, groupMultiplier float64,
	cacheTokens int, cacheReadPricePerMillion float64,
	modelPrice float64, userGroupMultiplier float64,
) map[string]interface{} {
	other := make(map[string]interface{})
	other["model_input_price"] = inputPricePerMillion
	other["model_output_price"] = outputPricePerMillion
	other["group_multiplier"] = groupMultiplier
	other["cache_tokens"] = cacheTokens
	other["cache_read_price"] = cacheReadPricePerMillion
	other["model_price"] = modelPrice
	other["user_group_multiplier"] = userGroupMultiplier
	other["frt"] = float64(relayInfo.FirstResponseTime.UnixMilli() - relayInfo.StartTime.UnixMilli())
	if relayInfo.ReasoningEffort != "" {
		other["reasoning_effort"] = relayInfo.ReasoningEffort
	}
	if relayInfo.IsModelMapped {
		other["is_model_mapped"] = true
		other["upstream_model_name"] = relayInfo.UpstreamModelName
	}

	isSystemPromptOverwritten := common.GetContextKeyBool(ctx, constant.ContextKeySystemPromptOverride)
	if isSystemPromptOverwritten {
		other["is_system_prompt_overwritten"] = true
	}

	adminInfo := make(map[string]interface{})
	adminInfo["use_channel"] = ctx.GetStringSlice("use_channel")
	isMultiKey := common.GetContextKeyBool(ctx, constant.ContextKeyChannelIsMultiKey)
	if isMultiKey {
		adminInfo["is_multi_key"] = true
		adminInfo["multi_key_index"] = common.GetContextKeyInt(ctx, constant.ContextKeyChannelMultiKeyIndex)
	}

	isLocalCountTokens := common.GetContextKeyBool(ctx, constant.ContextKeyLocalCountTokens)
	if isLocalCountTokens {
		adminInfo["local_count_tokens"] = isLocalCountTokens
	}

	other["admin_info"] = adminInfo
	appendRequestPath(ctx, relayInfo, other)
	return other
}

func GenerateWssOtherInfo(ctx *gin.Context, relayInfo *relaycommon.RelayInfo, usage *dto.RealtimeUsage,
	inputPricePerMillion, outputPricePerMillion, audioInputPricePerMillion, audioOutputPricePerMillion, groupMultiplier, modelPrice, userGroupMultiplier float64,
) map[string]interface{} {
	info := GenerateTextOtherInfo(ctx, relayInfo, inputPricePerMillion, outputPricePerMillion, groupMultiplier, 0, 0.0, modelPrice, userGroupMultiplier)
	info["ws"] = true
	info["audio_input"] = usage.InputTokenDetails.AudioTokens
	info["audio_output"] = usage.OutputTokenDetails.AudioTokens
	info["text_input"] = usage.InputTokenDetails.TextTokens
	info["text_output"] = usage.OutputTokenDetails.TextTokens
	info["audio_input_price"] = audioInputPricePerMillion
	info["audio_output_price"] = audioOutputPricePerMillion
	return info
}

func GenerateAudioOtherInfo(ctx *gin.Context, relayInfo *relaycommon.RelayInfo, usage *dto.Usage,
	inputPricePerMillion, outputPricePerMillion, audioInputPricePerMillion, audioOutputPricePerMillion, groupMultiplier, modelPrice, userGroupMultiplier float64,
) map[string]interface{} {
	info := GenerateTextOtherInfo(ctx, relayInfo, inputPricePerMillion, outputPricePerMillion, groupMultiplier, 0, 0.0, modelPrice, userGroupMultiplier)
	info["audio"] = true
	info["audio_input"] = usage.PromptTokensDetails.AudioTokens
	info["audio_output"] = usage.CompletionTokenDetails.AudioTokens
	info["text_input"] = usage.PromptTokensDetails.TextTokens
	info["text_output"] = usage.CompletionTokenDetails.TextTokens
	info["audio_input_price"] = audioInputPricePerMillion
	info["audio_output_price"] = audioOutputPricePerMillion
	return info
}

func GenerateClaudeOtherInfo(ctx *gin.Context, relayInfo *relaycommon.RelayInfo,
	inputPricePerMillion, outputPricePerMillion, groupMultiplier float64,
	cacheTokens int, cacheReadPricePerMillion float64,
	cacheCreationTokens int, cacheCreationPricePerMillion float64,
	cacheCreationTokens5m int, cacheCreation5mPricePerMillion float64,
	cacheCreationTokens1h int, cacheCreation1hPricePerMillion float64,
	modelPrice float64, userGroupMultiplier float64,
) map[string]interface{} {
	info := GenerateTextOtherInfo(ctx, relayInfo, inputPricePerMillion, outputPricePerMillion, groupMultiplier, cacheTokens, cacheReadPricePerMillion, modelPrice, userGroupMultiplier)
	info["claude"] = true
	info["cache_creation_tokens"] = cacheCreationTokens
	info["cache_creation_price"] = cacheCreationPricePerMillion
	if cacheCreationTokens5m != 0 {
		info["cache_creation_tokens_5m"] = cacheCreationTokens5m
		info["cache_creation_price_5m"] = cacheCreation5mPricePerMillion
	}
	if cacheCreationTokens1h != 0 {
		info["cache_creation_tokens_1h"] = cacheCreationTokens1h
		info["cache_creation_price_1h"] = cacheCreation1hPricePerMillion
	}
	return info
}

func GenerateMjOtherInfo(relayInfo *relaycommon.RelayInfo, priceData types.PerCallPriceData) map[string]interface{} {
	other := make(map[string]interface{})
	other["model_price"] = priceData.ModelPrice
	other["group_ratio"] = priceData.GroupRatioInfo.GroupRatio
	if priceData.GroupRatioInfo.HasSpecialRatio {
		other["user_group_ratio"] = priceData.GroupRatioInfo.GroupSpecialRatio
	}
	appendRequestPath(nil, relayInfo, other)
	return other
}
