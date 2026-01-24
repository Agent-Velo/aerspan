package pricing_setting

import (
	"fmt"
	"sync"

	"github.com/QuantumNous/new-api/common"
)

type TokenPriceTier struct {
	// Min is the inclusive lower bound (tokens).
	Min int `json:"min"`
	// Max is the exclusive upper bound (tokens). If omitted or <= 0, the tier has no upper bound.
	Max *int `json:"max,omitempty"`
	// Multiplier scales the base price for tokens within the tier.
	Multiplier float64 `json:"multiplier"`
}

var (
	modelInputTokenTierMap      map[string][]TokenPriceTier
	modelInputTokenTierMapMutex sync.RWMutex

	modelOutputTokenTierMap      map[string][]TokenPriceTier
	modelOutputTokenTierMapMutex sync.RWMutex
)

func normalizeTier(tier TokenPriceTier) (TokenPriceTier, error) {
	if tier.Min < 0 {
		return TokenPriceTier{}, fmt.Errorf("min must be >= 0")
	}
	if tier.Max != nil && *tier.Max <= 0 {
		tier.Max = nil
	}
	if tier.Max != nil && *tier.Max <= tier.Min {
		return TokenPriceTier{}, fmt.Errorf("max must be > min")
	}
	if tier.Multiplier < 0 {
		return TokenPriceTier{}, fmt.Errorf("multiplier must be >= 0")
	}
	return tier, nil
}

func rangesOverlap(a, b TokenPriceTier) bool {
	aMax := a.Max
	bMax := b.Max
	if aMax != nil && *aMax <= b.Min {
		return false
	}
	if bMax != nil && *bMax <= a.Min {
		return false
	}
	return true
}

func validateTiers(modelName string, tiers []TokenPriceTier) ([]TokenPriceTier, error) {
	if len(tiers) == 0 {
		return nil, nil
	}
	normalized := make([]TokenPriceTier, 0, len(tiers))
	for i, tier := range tiers {
		n, err := normalizeTier(tier)
		if err != nil {
			return nil, fmt.Errorf("model %s tier[%d] invalid: %w", modelName, i, err)
		}
		normalized = append(normalized, n)
	}
	for i := 0; i < len(normalized); i++ {
		for j := i + 1; j < len(normalized); j++ {
			if rangesOverlap(normalized[i], normalized[j]) {
				return nil, fmt.Errorf("model %s tiers overlap: tier[%d] overlaps tier[%d]", modelName, i, j)
			}
		}
	}
	return normalized, nil
}

func matchTierMultiplier(tiers []TokenPriceTier, tokens int) (float64, bool) {
	if tokens < 0 {
		tokens = 0
	}
	for _, tier := range tiers {
		if tokens < tier.Min {
			continue
		}
		if tier.Max != nil && tokens >= *tier.Max {
			continue
		}
		return tier.Multiplier, true
	}
	return 1, false
}

func GetModelInputTokenPriceMultiplier(modelName string, inputTokens int) (float64, bool) {
	modelInputTokenTierMapMutex.RLock()
	defer modelInputTokenTierMapMutex.RUnlock()
	modelName = FormatMatchingModelName(modelName)
	tiers, ok := modelInputTokenTierMap[modelName]
	if !ok || len(tiers) == 0 {
		return 1, false
	}
	return matchTierMultiplier(tiers, inputTokens)
}

func GetModelOutputTokenPriceMultiplier(modelName string, outputTokens int) (float64, bool) {
	modelOutputTokenTierMapMutex.RLock()
	defer modelOutputTokenTierMapMutex.RUnlock()
	modelName = FormatMatchingModelName(modelName)
	tiers, ok := modelOutputTokenTierMap[modelName]
	if !ok || len(tiers) == 0 {
		return 1, false
	}
	return matchTierMultiplier(tiers, outputTokens)
}

// GetModelTokenPriceTierMultipliersByInputTokens returns tier multipliers for both input and output
// prices.
//
// Tier matching is based on input tokens only (i.e. prompt/context length). This supports vendors
// that increase both input & output prices when a request uses a larger context window.
func GetModelTokenPriceTierMultipliersByInputTokens(modelName string, inputTokens int) (inputMultiplier float64, outputMultiplier float64, inputMatched bool, outputMatched bool) {
	inputMultiplier, inputMatched = GetModelInputTokenPriceMultiplier(modelName, inputTokens)
	// NOTE: output tiers are also matched by input tokens.
	outputMultiplier, outputMatched = GetModelOutputTokenPriceMultiplier(modelName, inputTokens)
	return
}

func ModelInputTokenPriceMultiplier2JSONString() string {
	modelInputTokenTierMapMutex.RLock()
	defer modelInputTokenTierMapMutex.RUnlock()
	jsonBytes, err := common.Marshal(modelInputTokenTierMap)
	if err != nil {
		common.SysError("error marshalling model input token tier multipliers: " + err.Error())
	}
	return string(jsonBytes)
}

func UpdateModelInputTokenPriceMultiplierByJSONString(jsonStr string) error {
	tmp := make(map[string][]TokenPriceTier)
	if err := common.Unmarshal([]byte(jsonStr), &tmp); err != nil {
		return err
	}
	validated := make(map[string][]TokenPriceTier, len(tmp))
	for modelName, tiers := range tmp {
		normalized, err := validateTiers(modelName, tiers)
		if err != nil {
			return err
		}
		if len(normalized) > 0 {
			validated[modelName] = normalized
		}
	}
	modelInputTokenTierMapMutex.Lock()
	modelInputTokenTierMap = validated
	modelInputTokenTierMapMutex.Unlock()
	InvalidateExposedDataCache()
	return nil
}

func ModelOutputTokenPriceMultiplier2JSONString() string {
	modelOutputTokenTierMapMutex.RLock()
	defer modelOutputTokenTierMapMutex.RUnlock()
	jsonBytes, err := common.Marshal(modelOutputTokenTierMap)
	if err != nil {
		common.SysError("error marshalling model output token tier multipliers: " + err.Error())
	}
	return string(jsonBytes)
}

func UpdateModelOutputTokenPriceMultiplierByJSONString(jsonStr string) error {
	tmp := make(map[string][]TokenPriceTier)
	if err := common.Unmarshal([]byte(jsonStr), &tmp); err != nil {
		return err
	}
	validated := make(map[string][]TokenPriceTier, len(tmp))
	for modelName, tiers := range tmp {
		normalized, err := validateTiers(modelName, tiers)
		if err != nil {
			return err
		}
		if len(normalized) > 0 {
			validated[modelName] = normalized
		}
	}
	modelOutputTokenTierMapMutex.Lock()
	modelOutputTokenTierMap = validated
	modelOutputTokenTierMapMutex.Unlock()
	InvalidateExposedDataCache()
	return nil
}

func GetModelInputTokenPriceMultiplierTiers(modelName string) ([]TokenPriceTier, bool) {
	modelName = FormatMatchingModelName(modelName)
	modelInputTokenTierMapMutex.RLock()
	defer modelInputTokenTierMapMutex.RUnlock()
	tiers, ok := modelInputTokenTierMap[modelName]
	if !ok || len(tiers) == 0 {
		return nil, false
	}
	cp := make([]TokenPriceTier, len(tiers))
	copy(cp, tiers)
	return cp, true
}

func GetModelOutputTokenPriceMultiplierTiers(modelName string) ([]TokenPriceTier, bool) {
	modelName = FormatMatchingModelName(modelName)
	modelOutputTokenTierMapMutex.RLock()
	defer modelOutputTokenTierMapMutex.RUnlock()
	tiers, ok := modelOutputTokenTierMap[modelName]
	if !ok || len(tiers) == 0 {
		return nil, false
	}
	cp := make([]TokenPriceTier, len(tiers))
	copy(cp, tiers)
	return cp, true
}
