package service

import "github.com/QuantumNous/new-api/dto"

// UsageWithoutCacheFields removes cache-specific usage fields.
//
// When isAnthropicUsageSemantic is true, the upstream "prompt/input" token count excludes
// cache-read and cache-create tokens. In that case, we merge cache tokens back into
// PromptTokens so downstream clients see a normal (no-cache) usage breakdown.
func UsageWithoutCacheFields(usage dto.Usage, isAnthropicUsageSemantic bool) dto.Usage {
	clean := usage

	if isAnthropicUsageSemantic {
		cacheReadTokens := usage.PromptTokensDetails.CachedTokens
		cacheCreateTokens := usage.PromptTokensDetails.CachedCreationTokens
		if cacheCreateTokens == 0 {
			cacheCreateTokens = usage.ClaudeCacheCreation5mTokens + usage.ClaudeCacheCreation1hTokens
		}
		cacheTokens := cacheReadTokens + cacheCreateTokens
		if cacheTokens != 0 {
			clean.PromptTokens += cacheTokens
			if clean.InputTokens != 0 {
				clean.InputTokens += cacheTokens
			}
			clean.TotalTokens = clean.PromptTokens + clean.CompletionTokens
		}
	}

	clean.PromptCacheHitTokens = 0
	clean.PromptTokensDetails.CachedTokens = 0
	clean.PromptTokensDetails.CachedCreationTokens = 0
	clean.ClaudeCacheCreation5mTokens = 0
	clean.ClaudeCacheCreation1hTokens = 0
	if clean.InputTokensDetails != nil {
		details := *clean.InputTokensDetails
		details.CachedTokens = 0
		clean.InputTokensDetails = &details
	}
	return clean
}
