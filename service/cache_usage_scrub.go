package service

import (
	"encoding/json"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

var cacheUsageFieldHints = []string{
	"\"cached_tokens\"",
	"\"prompt_cache_hit_tokens\"",
	"\"cache_read_input_tokens\"",
	"\"cache_creation_input_tokens\"",
	"\"cache_creation\"",
	"\"claude_cache_creation_5_m_tokens\"",
	"\"claude_cache_creation_1_h_tokens\"",
}

func MightContainCacheUsageFields(data string) bool {
	for _, hint := range cacheUsageFieldHints {
		if strings.Contains(data, hint) {
			return true
		}
	}
	return false
}

func ScrubCacheUsageFromJSONString(data string, isAnthropicUsageSemantic bool) (string, bool) {
	if data == "" {
		return data, false
	}
	out, ok := ScrubCacheUsageFromJSON(common.StringToByteSlice(data), isAnthropicUsageSemantic)
	if !ok {
		return data, false
	}
	return string(out), true
}

func ScrubCacheUsageFromJSON(payload []byte, isAnthropicUsageSemantic bool) ([]byte, bool) {
	if len(payload) == 0 {
		return payload, false
	}

	var root any
	if err := common.Unmarshal(payload, &root); err != nil {
		return payload, false
	}

	modified := scrubCacheUsageValue(root, isAnthropicUsageSemantic)
	if !modified {
		return payload, false
	}

	out, err := common.Marshal(root)
	if err != nil {
		return payload, false
	}
	return out, true
}

func scrubCacheUsageValue(value any, isAnthropicUsageSemantic bool) bool {
	switch typed := value.(type) {
	case map[string]any:
		modified := false
		if usage, ok := typed["usage"].(map[string]any); ok {
			modified = scrubCacheUsageMap(usage, isAnthropicUsageSemantic) || modified
		}
		for _, v := range typed {
			modified = scrubCacheUsageValue(v, isAnthropicUsageSemantic) || modified
		}
		return modified
	case []any:
		modified := false
		for _, v := range typed {
			modified = scrubCacheUsageValue(v, isAnthropicUsageSemantic) || modified
		}
		return modified
	default:
		return false
	}
}

func scrubCacheUsageMap(usage map[string]any, isAnthropicUsageSemantic bool) bool {
	if usage == nil {
		return false
	}
	modified := false

	if isAnthropicUsageSemantic {
		modified = mergeCacheUsageIntoInputTokens(usage) || modified
	}

	modified = setZeroIfPresent(usage, "cached_tokens") || modified
	modified = setZeroIfPresent(usage, "prompt_cache_hit_tokens") || modified
	modified = setZeroIfPresent(usage, "cache_read_input_tokens") || modified
	modified = setZeroIfPresent(usage, "cache_creation_input_tokens") || modified
	modified = setZeroIfPresent(usage, "claude_cache_creation_5_m_tokens") || modified
	modified = setZeroIfPresent(usage, "claude_cache_creation_1_h_tokens") || modified
	if _, ok := usage["cache_creation"]; ok {
		delete(usage, "cache_creation")
		modified = true
	}

	if details, ok := usage["prompt_tokens_details"].(map[string]any); ok {
		modified = setZeroIfPresent(details, "cached_tokens") || modified
		modified = setZeroIfPresent(details, "cached_creation_tokens") || modified
	}
	if details, ok := usage["input_tokens_details"].(map[string]any); ok {
		modified = setZeroIfPresent(details, "cached_tokens") || modified
	}
	return modified
}

func mergeCacheUsageIntoInputTokens(usage map[string]any) bool {
	isClaudeUsage := false
	if _, ok := usage["cache_read_input_tokens"]; ok {
		isClaudeUsage = true
	}
	if _, ok := usage["cache_creation_input_tokens"]; ok {
		isClaudeUsage = true
	}
	if _, ok := usage["cache_creation"]; ok {
		isClaudeUsage = true
	}

	cacheRead := 0
	cacheCreate := 0
	if isClaudeUsage {
		cacheRead = getIntAny(usage["cache_read_input_tokens"])
		cacheCreate = getIntAny(usage["cache_creation_input_tokens"])
		if cacheCreate == 0 {
			if creation, ok := usage["cache_creation"].(map[string]any); ok {
				cacheCreate = getIntAny(creation["ephemeral_5m_input_tokens"]) + getIntAny(creation["ephemeral_1h_input_tokens"])
			}
		}
		if cacheCreate == 0 {
			cacheCreate = getIntAny(usage["claude_cache_creation_5_m_tokens"]) + getIntAny(usage["claude_cache_creation_1_h_tokens"])
		}
	} else {
		if details, ok := usage["prompt_tokens_details"].(map[string]any); ok {
			cacheRead = getIntAny(details["cached_tokens"])
			cacheCreate = getIntAny(details["cached_creation_tokens"])
		}
		if cacheRead == 0 {
			cacheRead = getIntAny(usage["cached_tokens"])
		}
		if cacheRead == 0 {
			cacheRead = getIntAny(usage["prompt_cache_hit_tokens"])
		}
		if cacheCreate == 0 {
			cacheCreate = getIntAny(usage["claude_cache_creation_5_m_tokens"]) + getIntAny(usage["claude_cache_creation_1_h_tokens"])
		}
	}

	cacheTokens := cacheRead + cacheCreate
	if cacheTokens == 0 {
		return false
	}

	if isClaudeUsage {
		inputTokens := getIntAny(usage["input_tokens"])
		usage["input_tokens"] = inputTokens + cacheTokens
		return true
	}

	promptTokens := getIntAny(usage["prompt_tokens"])
	usage["prompt_tokens"] = promptTokens + cacheTokens
	completionTokens := getIntAny(usage["completion_tokens"])
	usage["total_tokens"] = promptTokens + cacheTokens + completionTokens
	return true
}

func setZeroIfPresent(m map[string]any, key string) bool {
	if m == nil {
		return false
	}
	if _, ok := m[key]; !ok {
		return false
	}
	m[key] = 0
	return true
}

func getIntAny(v any) int {
	switch typed := v.(type) {
	case nil:
		return 0
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	case float32:
		return int(typed)
	case json.Number:
		if i, err := typed.Int64(); err == nil {
			return int(i)
		}
		if f, err := typed.Float64(); err == nil {
			return int(f)
		}
		return 0
	case string:
		if i, err := strconv.Atoi(typed); err == nil {
			return i
		}
		return 0
	default:
		return 0
	}
}
